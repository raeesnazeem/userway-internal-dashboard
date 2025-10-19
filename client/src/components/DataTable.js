import React from "react";
import "./DataTable.css";

// A reusable data table component
const DataTable = ({ headers, rows, renderRow }) => {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map((row, index) => renderRow(row, index))}</tbody>
      </table>
    </div>
  );
};

// Helper component for the scan button/indicator
export const ScanCell = ({ scanStatus, onScan }) => {
  if (scanStatus === "loading") {
    return <div className="loader"></div>;
  }

  return (
    <>
      <span
        className={`status-indicator ${
          scanStatus === "active" ? "active" : ""
        } ${scanStatus === "error" ? "error" : ""}`}
      ></span>
      <button
        className="scan-button"
        onClick={onScan}
        disabled={scanStatus === "loading"}
      >
        Scan
      </button>
    </>
  );
};

export default DataTable;