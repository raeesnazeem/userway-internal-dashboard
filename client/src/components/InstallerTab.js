import React, { useRef, useEffect } from "react"

function InstallerTab({
  socket,
  isInjecting,
  isVerifying,
  setIsInjecting,
  setIsVerifying,
  bulkInjectLogs,
}) {
  const logContainerRef = useRef(null)
  const isJobRunning = isInjecting || isVerifying

  // --- Event Handlers (Moved from App.js) ---
  const handleStartInject = () => {
    if (!socket || isJobRunning) return
    if (
      !window.confirm("Are you sure you want to start the bulk inject process?")
    ) {
      return
    }
    // We update parent state via prop
    setIsInjecting(true)
    socket.emit("start-bulk-inject", {})
  }

  const handleStartVerify = () => {
    if (!socket || isJobRunning) return
    if (
      !window.confirm(
        "Are you sure you want to start the interactive verification process?"
      )
    ) {
      return
    }
    // We update parent state via prop
    setIsVerifying(true)
    socket.emit("start-interactive-verify", {})
  }

  const handleStop = () => {
    if (!socket) return

    if (isInjecting) {
      console.log("Emitting stop-bulk-inject")
      socket.emit("stop-bulk-inject")
    }
    if (isVerifying) {
      console.log("Emitting stop-interactive-verify")
      socket.emit("stop-interactive-verify")
    }
    // Parent state will be reset by the 'bulk-inject-log' listener in App.js
  }

  // --- Log Style Helper (Moved from App.js) ---
  const getLogStyle = (level) => {
    switch (level) {
      case "error":
        return { color: "#ff8a8a", whiteSpace: "pre-wrap" } // Red
      case "success":
        return { color: "#8aff8a", whiteSpace: "pre-wrap" } // Green
      default:
        return { color: "#f0f0f0", whiteSpace: "pre-wrap" } // Default
    }
  }

  // --- Auto-scroll Effect (Moved from App.js) ---
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [bulkInjectLogs])

  // Filter logs: Don't show Login Tester logs here
  const installerLogs = bulkInjectLogs.filter(
    (log) => !log.message.startsWith("[Test]")
  )

  // --- Render ---
  return (
    <div>
      <div className="dashboard-header">
        <h2>Installer</h2>
        <div className="button-group" style={{ display: "flex", gap: "10px" }}>
          {!isJobRunning ? (
            <>
              <button onClick={handleStartInject} className="scan-all-button">
                Start Bulk Inject
              </button>
              <button
                onClick={handleStartVerify}
                className="scan-all-button"
                style={{ backgroundColor: "#007bff" }}
              >
                Verify Additions
              </button>
            </>
          ) : (
            <button
              onClick={handleStop}
              className="scan-all-button"
              style={{ backgroundColor: "#dc3545" }}
            >
              Stop Process
            </button>
          )}
        </div>
      </div>
      <p className="description" style={{ margin: "1rem 0" }}>
        Read from a Google Sheet and inject the UserWay script into WordPress
        sites.
      </p>
      <div
        className="log-container"
        ref={logContainerRef}
        style={{
          backgroundColor: "#222",
          fontFamily: "monospace",
          padding: "1rem",
          height: "500px",
          overflowY: "auto",
          borderRadius: "8px",
          border: "1px solid #444",
          marginTop: "1rem",
        }}
      >
        {installerLogs
          .slice()
          .reverse()
          .map((log, index) => (
            <div key={index} style={getLogStyle(log.level)}>
              {log.message}
            </div>
          ))}
      </div>
    </div>
  )
}

export default InstallerTab
