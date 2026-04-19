import { getStats, getExercises, getProgression } from "@/lib/api";

// Debug-only page — fetches at request time so build doesn't try to
// prerender while the backend is unreachable.
export const dynamic = "force-dynamic";

export default async function TestPage() {
  const stats = await getStats();
  const exercises = await getExercises();
  const prog = await getProgression("chest press");
  
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Debug Test</h1>
      <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "8px" }}>
        {JSON.stringify({ stats, exercises: exercises.slice(0,3), progPoints: prog.data.length }, null, 2)}
      </pre>
    </div>
  );
}
