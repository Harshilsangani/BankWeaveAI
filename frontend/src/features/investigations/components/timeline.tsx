"use client";
import type { Investigation } from "@/features/investigations/types";

export function InvestigationTimeline({ items }: { items: Investigation["timeline"] }) {
  return (
    <div className="timeline">
      {items.map((item) => (
        <div className="timeline-item" key={item.title}>
          <span className="timeline-node" />
          <div>
            <span className="mono muted">
              {item.time.includes("T")
                ? new Date(item.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
                : item.time + " IST"}
            </span>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
