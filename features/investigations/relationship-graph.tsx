"use client";
import { useState } from "react";
import { useHorizontalOverflow } from "@/hooks/use-horizontal-overflow";
import type { RelationshipGraph as Data } from "@/types/relationships";
import { Badge } from "@/components/ui";
export function RelationshipGraph({ data }: { data: Data }) {
  const { ref, overflow } = useHorizontalOverflow();
  const [selected, setSelected] = useState<string>();
  const layers = ["customer", "account", "transaction", "device"] as const;
  const columns = layers.map((kind) => data.nodes.filter((node) => node.kind === kind));
  const height = Math.max(240, Math.max(...columns.map((nodes) => nodes.length)) * 48 + 90);
  const positions = new Map(
    columns.flatMap((nodes, column) =>
      nodes.map((node, index) => [node.id, { x: 20 + column * 170, y: 65 + index * 48 }] as const)
    )
  );
  const node = data.nodes.find((node) => node.id === selected),
    related = data.edges.filter((edge) => edge.source === selected || edge.target === selected);
  return (
    <section className="panel relationship-panel">
      <div className="chart-heading">
        <div>
          <h3>Observed relationship map</h3>
          <p className="muted">
            {data.sampledTransactions} sampled flagged transactions · {data.version}
          </p>
        </div>
        <Badge>Recorded links</Badge>
      </div>
      {!data.available ? (
        <p className="muted">{data.reason}</p>
      ) : !data.nodes.length ? (
        <p className="muted">No observed device links match this scope.</p>
      ) : (
        <>
          {overflow && (
            <p className="table-scroll-hint">
              Scroll horizontally to explore all four relationship columns.
            </p>
          )}
          <div
            ref={ref}
            className="relationship-scroll"
            tabIndex={0}
            role="region"
            aria-label="Relationship map. Scroll to explore all columns."
          >
            <svg
              viewBox={`0 0 690 ${height}`}
              role="group"
              aria-label="Observed customer account transaction device relationships"
            >
              {layers.map((kind, index) => (
                <text key={kind} x={20 + index * 170} y={30} className="graph-column-label">
                  {kind.toUpperCase()}S
                </text>
              ))}
              {data.edges.map((edge) => {
                const from = positions.get(edge.source),
                  to = positions.get(edge.target);
                if (!from || !to) return null;
                return (
                  <path
                    key={edge.id}
                    d={`M${from.x + 140},${from.y + 17} C${from.x + 157},${from.y + 17} ${to.x - 17},${to.y + 17} ${to.x},${to.y + 17}`}
                    className={
                      edge.source === selected || edge.target === selected
                        ? "graph-edge selected"
                        : "graph-edge"
                    }
                  />
                );
              })}
              {data.nodes.map((node) => {
                const point = positions.get(node.id)!;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${point.x},${point.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${node.kind} ${node.label}`}
                    onClick={() => setSelected(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(node.id);
                      }
                    }}
                    className={selected === node.id ? "graph-node selected" : "graph-node"}
                  >
                    <rect width={140} height={34} rx={7} />
                    <text x={10} y={21}>
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {node ? (
            <div className="graph-detail">
              <strong>
                {node.kind} · {node.label}
              </strong>
              {related.map((edge) => (
                <p key={edge.id}>
                  {edge.relation}: {edge.source} → {edge.target}
                  <br />
                  <span className="mono">References: {edge.references.join(", ")}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="muted">
              Select a node to inspect its recorded links and source references.
            </p>
          )}
        </>
      )}
      <ul className="quality-limitations">
        {data.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  );
}
