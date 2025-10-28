import React from "react"
import DataTable, { ScanCell } from "./DataTable"

// --- Basecamp Search URL ---
const BASECAMP_SEARCH_URL = "https://3.basecamp.com/4023059/search?q="

// --- Category Filter ---
const CATEGORIES = [
  "All",
  "Do Not Add",
  "Annual",
  "Blanks",
  "Basic",
  "Cancelled",
  "Deactivated",
]

function MasterTab({
  masterData,
  scanStatus,
  handleScan,
  handleScanAll,
  isScanningAll,
  searchTerm,
  setSearchTerm,
  activeCategory,
  setActiveCategory,
}) {
  // --- Filtering Logic (Moved from App.js) ---
  const filteredData = masterData
    // 1. Initial Cleanup
    .filter((project) => (project.url || "").toLowerCase().trim() !== "website")
    .filter((project) => {
      return (
        project.date ||
        project.projectName ||
        project.url ||
        project.deactivationDate ||
        project.isCancelledPro ||
        project.isCancelledMaster
      )
    })
    // 2. Category Filter
    .filter((project) => {
      const projectDate = (project.date || "").toLowerCase().trim()
      const isCancelled = project.isCancelledPro || project.isCancelledMaster
      const isDeactivated = !!project.deactivationDate

      switch (activeCategory) {
        case "All":
          if (projectDate === "accessiblity add-on pricing updated")
            return false
          if (projectDate === "due date") return false
          if (projectDate === "notification status") return false
          if (projectDate.includes("wave")) return false
          if (projectDate === "") return false
          if (projectDate.includes("do not add")) return false
          if (projectDate.includes("annual")) return false
          if (projectDate.includes("basic")) return false
          return true
        case "Do Not Add":
          return projectDate.includes("do not add")
        case "Annual":
          return projectDate.includes("annual")
        case "Blanks":
          return projectDate === ""
        case "Basic":
          return projectDate.includes("basic")
        case "Cancelled":
          return isCancelled
        case "Deactivated":
          return isDeactivated
        default:
          return true
      }
    })
    // 3. Search Filter
    .filter((project) => {
      const term = searchTerm.toLowerCase()
      if (term === "") return true
      const nameMatch = project.projectName.toLowerCase().includes(term)
      const urlMatch = project.url && project.url.toLowerCase().includes(term)
      return nameMatch || urlMatch
    })

  // --- Render Function ---
  return (
    <>
      <div className="dashboard-header">
        <h2>Master Project List</h2>
        <div className="filter-controls-wrapper">
          <input
            type="text"
            placeholder="Search by name or URL..."
            className="search-filter"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="category-filters">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                className={`category-button ${
                  activeCategory === category ? "active" : ""
                }`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <button
          className="scan-all-button"
          onClick={handleScanAll}
          disabled={isScanningAll}
        >
          {isScanningAll ? "Scanning..." : "Scan All (Max 100)"}
        </button>
      </div>

      <DataTable
        headers={[
          "Date to Activate",
          "Project Name",
          "Website URL",
          "Scan",
          "Installation Status",
        ]}
        rows={filteredData}
        renderRow={(project, index) => {
          const scanState = scanStatus[project.id] || {}
          const isCancelled =
            project.isCancelledPro || project.isCancelledMaster
          let scanCellStatus = "idle"
          let installationStatusText = scanState.status || "---"
          let statusClassName = ""

          if (isCancelled) {
            scanCellStatus = "error"
            installationStatusText = "Cancelled Client"
            statusClassName = "cancelled-status"
          } else if (project.deactivationDate) {
            scanCellStatus = "error"
            installationStatusText = `Deactivated on ${project.deactivationDate}`
            statusClassName = "deactivated-status"
          } else {
            if (scanState.isLoading) scanCellStatus = "loading"
            else if (scanState.isPresent) {
              scanCellStatus = "active"
              installationStatusText =
                scanState.status === "Pro"
                  ? "Pro Script Active"
                  : "Basic Script Active"
              statusClassName =
                scanState.status === "Pro" ? "pro-status" : "basic-status"
            } else if (scanState.status && scanState.status !== "Not Found") {
              scanCellStatus = "error"
              statusClassName = "error-status"
            }
          }

          const encodedProjectName = encodeURIComponent(project.projectName)
          const projectLink = `${BASECAMP_SEARCH_URL}${encodedProjectName}`

          return (
            <tr key={project.id}>
              <td>{project.date}</td>
              <td>
                <a href={projectLink} target="_blank" rel="noopener noreferrer">
                  {project.projectName}
                </a>
              </td>
              <td>
                {project.url ? (
                  <a
                    href={
                      project.url.startsWith("http")
                        ? project.url
                        : `https://${project.url}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {project.url}
                  </a>
                ) : (
                  "---"
                )}
              </td>
              <td>
                <ScanCell
                  scanStatus={scanCellStatus}
                  onScan={() => handleScan(project.url, project.id)}
                />
              </td>
              <td className={statusClassName}> {installationStatusText} </td>
            </tr>
          )
        }}
      />
    </>
  )
}

export default MasterTab
