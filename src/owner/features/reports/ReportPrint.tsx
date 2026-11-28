"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { ReportPrintInfo } from "@/contracts";
import { formatDateTime } from "@/ui";
import "./report-print.css";

type Row = Record<string, unknown>;

export interface PrintTable {
  title: string;
  columns: { key: string; header: string; className?: string }[];
  rows: Row[];
  /** Total row printed once after the last row, keyed like the columns. */
  total?: Row;
}

export interface ReportPrintProps {
  info: ReportPrintInfo;
  title: string;
  reportType: string;
  subtitle: string;
  parameters: Record<string, string>;
  tables: PrintTable[];
  summary: [string, string][];
  recordCount: number;
}

const ROLE_LABEL: Record<string, string> = { owner_admin: "Owner / Admin", barista: "Barista" };

const isNum = (c: { className?: string }) => (c.className ?? "").split(" ").includes("num");
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** A null value prints as a blank line to fill in by hand. */
function Pairs({ items }: { items: [string, string | null][] }) {
  return (
    <dl className="rp-pairs">
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          {v === null ? <dd className="rp-write" /> : <dd>{v}</dd>}
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Without a value, the line is left blank for handwriting. */
function SignField({ label, value }: { label: string; value?: string }) {
  return value === undefined ? (
    <p className="rp-sign-line">
      {label}: <span />
    </p>
  ) : (
    <p>
      {label}: {value}
    </p>
  );
}

function SignatureBlock({ heading, name, position }: { heading: string; name?: string; position?: string }) {
  return (
    <section className="rp-sign" aria-label={heading}>
      <h3>{heading}</h3>
      <p className="rp-sign-line rp-sign-tall">
        Signature: <span />
      </p>
      <SignField label="Name" value={name} />
      <SignField label="Position" value={position} />
      <p className="rp-sign-line">
        Date: <span />
      </p>
    </section>
  );
}

/**
 * The printed report (A4, multi-page): a document of its own, rendered into <body> so the print
 * stylesheet can print it alone. Hidden on screen. Signatures and the preparer's name and position
 * are blank lines for handwriting.
 */
export function ReportPrint({ info, title, reportType, subtitle, parameters, tables, summary, recordCount }: ReportPrintProps) {
  const prepared = formatDateTime(info.preparedAt);
  const params = Object.entries(parameters);
  const paramText = params.map(([k, v]) => `${k}: ${v}`).join("; ");

  return createPortal(
    <article className="report-print" aria-label={`${title} (print)`}>
      <header className="rp-head">
        <div>
          <p className="rp-business">Gunita Kopi</p>
          <h1>{title}</h1>
          <p className="rp-sub">
            {subtitle} · {recordCount} records · Generated {prepared}
          </p>
        </div>
        <p className="rp-id">
          Report ID
          <strong>{info.reportId}</strong>
        </p>
      </header>

      <div className="rp-meta">
        <section>
          <h2>Report Information</h2>
          <Pairs
            items={[
              ["Business", "Gunita Kopi"],
              ["Report title", title],
              ["Report ID", info.reportId],
              ["Report type", reportType],
              ["Generated", prepared],
              ["Prepared by", null],
            ]}
          />
        </section>
        <section>
          <h2>Report Parameters</h2>
          <Pairs items={params} />
        </section>
      </div>

      {tables.map((t) => (
        <section key={t.title} className="rp-section">
          <h2>{t.title}</h2>
          <table className="rp-table">
            <thead>
              <tr>
                {t.columns.map((c) => (
                  <th key={c.key} className={isNum(c) ? "rp-num" : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.length === 0 && (
                <tr>
                  <td colSpan={t.columns.length}>No records match the selected parameters.</td>
                </tr>
              )}
              {t.rows.map((row, i) => (
                <tr key={i}>
                  {t.columns.map((c) => (
                    <td key={c.key} className={isNum(c) ? "rp-num" : undefined}>
                      {text(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {t.total && (
              <tfoot>
                <tr>
                  {t.columns.map((c) => (
                    <td key={c.key} className={isNum(c) ? "rp-num" : undefined}>
                      {text(t.total![c.key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      ))}

      <section className="rp-section rp-keep">
        <h2>Summary and Totals</h2>
        <Pairs items={summary} />
      </section>

      <section className="rp-section rp-keep">
        <h2>Report Preparation Information</h2>
        <Pairs
          items={[
            ["Report ID", info.reportId],
            ["Prepared by", null],
            ["Username and role", `${info.preparedBy.username} · ${ROLE_LABEL[info.preparedBy.role] ?? info.preparedBy.role}`],
            ["Date and time prepared", prepared],
            ["Report type", reportType],
            ["Applied parameters", paramText || "None"],
            ["Records included", String(recordCount)],
          ]}
        />
      </section>

      <div className="rp-signatures">
        <SignatureBlock heading="PREPARED BY" />
        <SignatureBlock heading="OWNER'S APPROVAL" name={info.ownerName ?? ""} position="Owner" />
      </div>
    </article>,
    document.body,
  );
}
