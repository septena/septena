// Septena calendar helper — prints upcoming events as JSON on stdout.
//
// Uses EventKit to read EKEvents across all calendars for a configurable
// window (default 7 days). macOS shows its Calendar-access prompt on first
// run via the embedded Info.plist (NSCalendarsFullAccessUsageDescription).
//
// Build: see build.sh in this directory.

#import <Foundation/Foundation.h>
#import <EventKit/EventKit.h>

static BOOL requestAccess(EKEventStore *store) {
    __block BOOL granted = NO;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);

    void (^handler)(BOOL, NSError * _Nullable) = ^(BOOL ok, NSError *err) {
        granted = ok;
        if (!ok && err) {
            fprintf(stderr, "access error: %s\n", err.localizedDescription.UTF8String);
        }
        dispatch_semaphore_signal(sem);
    };

    if (@available(macOS 14.0, *)) {
        [store requestFullAccessToEventsWithCompletion:handler];
    } else {
        [store requestAccessToEntityType:EKEntityTypeEvent completion:handler];
    }

    dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));
    return granted;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        double days = 7.0;
        const char *env = getenv("SEPTENA_CAL_DAYS");
        if (env) {
            double n = atof(env);
            if (n > 0) days = n;
        }

        EKAuthorizationStatus before = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
        fprintf(stderr, "auth status before: %ld\n", (long)before);

        EKEventStore *store = [[EKEventStore alloc] init];
        BOOL ok = requestAccess(store);
        EKAuthorizationStatus after = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
        fprintf(stderr, "request returned: %d, status after: %ld\n", ok, (long)after);

        // On macOS 14+, status 3 == fullAccess. Also accept legacy 3 == authorized.
        BOOL canRead = (after == 3);
        if (!canRead) {
            fputs("calendar access denied\n", stderr);
            return 2;
        }

        NSDate *start = [NSDate date];
        NSDate *end = [NSDate dateWithTimeIntervalSinceNow:days * 86400.0];
        NSPredicate *pred = [store predicateForEventsWithStartDate:start endDate:end calendars:nil];
        NSArray<EKEvent *> *events = [store eventsMatchingPredicate:pred] ?: @[];

        NSISO8601DateFormatter *iso = [[NSISO8601DateFormatter alloc] init];
        iso.formatOptions = NSISO8601DateFormatWithInternetDateTime;

        NSMutableArray *evOut = [NSMutableArray arrayWithCapacity:events.count];
        for (EKEvent *ev in events) {
            [evOut addObject:@{
                @"title":    ev.title ?: @"(no title)",
                @"start":    [iso stringFromDate:ev.startDate],
                @"end":      [iso stringFromDate:ev.endDate],
                @"calendar": ev.calendar.title ?: @"",
                @"all_day":  @(ev.allDay),
                @"location": ev.location ?: @"",
            }];
        }

        NSArray<EKCalendar *> *allCals = [store calendarsForEntityType:EKEntityTypeEvent] ?: @[];
        NSMutableArray *calOut = [NSMutableArray arrayWithCapacity:allCals.count];
        for (EKCalendar *c in allCals) {
            NSString *src = c.source.title ?: @"";
            [calOut addObject:@{
                @"title":  c.title ?: @"",
                @"source": src,
            }];
        }

        NSDictionary *payload = @{ @"calendars": calOut, @"events": evOut };
        NSError *err = nil;
        NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&err];
        if (!data) {
            fprintf(stderr, "json encode failed: %s\n", err.localizedDescription.UTF8String);
            return 3;
        }
        const char *outEnv = getenv("SEPTENA_CAL_OUT");
        if (outEnv && outEnv[0]) {
            NSString *path = [NSString stringWithUTF8String:outEnv];
            NSError *werr = nil;
            if (![data writeToFile:path options:NSDataWritingAtomic error:&werr]) {
                fprintf(stderr, "write failed: %s\n", werr.localizedDescription.UTF8String);
                return 4;
            }
        } else {
            [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
        }
    }
    return 0;
}
