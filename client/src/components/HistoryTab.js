import React from "react"
import DataTable from "./DataTable"

// --- Helper function to parse dates ---
const parseDate = (dateStr) => {
  if (!dateStr) return null
  const cleanDateStr = dateStr.trim()
  const parts = cleanDateStr.split("/")
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10)
    const day = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month - 1, day)
    }
  }
  return null
}

function HistoryTab({
  historyData,
  historySearchTerm,
  setHistorySearchTerm,
  historySortOrder,
  setHistorySortOrder,
}) {
  const toggleHistorySort = () => {
    setHistorySortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
  }

  // --- Filtering & Sorting Logic (Moved from App.js) ---
  const sortedAndFilteredHistory = historyData
    .filter((row) => {
      const url = row[1] || "" // URL is in col 1
      return url.toLowerCase().includes(historySearchTerm.toLowerCase())
    })
    .sort((a, b) => {
      const dateA = parseDate(a[5]) // Date is in col 5
      const dateB = parseDate(b[5])
      if (dateA === null && dateB === null) return 0
      if (dateA === null) return historySortOrder === "asc" ? 1 : -1
      if (dateB === null) return historySortOrder === "asc" ? -1 : 1
      if (historySortOrder === "asc") {
        return dateA - dateB
      } else {
        return dateB - dateA
      }
    })

  // --- Render ---
  return (
    <>
      <div className="dashboard-header">
        <h2>Usage & History</h2>
        <div className="filter-controls-wrapper">
          <input
            type="text"
            placeholder="Search by URL..."
            className="search-filter"
            value={historySearchTerm}
            onChange={(e) => setHistorySearchTerm(e.target.value)}
          />
        </div>
        <button className="sort-button" onClick={toggleHistorySort}>
          {`Sort Date ${
            historySortOrder === "asc" ? "Descending" : "Ascending"
          }`}
        </button>
      </div>
      <DataTable
        headers={["Date Activated", "Website URL"]}
        rows={sortedAndFilteredHistory}
        renderRow={(row, index) => (
          <tr key={row[1] || index}>
            <td>{row[5]}</td>
            <td>{row[1]}</td>
          </tr>
        )}
      />
    </>
  )
}

export default HistoryTab
