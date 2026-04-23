import Script from "next/script";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script id="septena-demo-boot" strategy="beforeInteractive">
        {`window.__SEPTENA_DEMO__=true;`}
      </Script>
      {children}
    </>
  );
}
