import React, { useState, useEffect, useRef } from "react"
import "./LoginTester.css"

const API_BASE_URL = "http://localhost:3001"

function LoginTester({ socket, results, logs }) {
  const [url, setUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const logContainerRef = useRef(null)

  // Filter logs to only show messages from this component
  const testLogs = logs.filter((log) => log.message.startsWith("[Test]"))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!url || !socket || isLoading) return
    setIsLoading(true)
    socket.emit("start-single-login-test", { url })
  }

  // Effect to reset loading state when results update
  useEffect(() => {
    setIsLoading(false)
  }, [results])

  // Auto-scroll log container
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [testLogs])

  // Log Style Helper
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

  return (
    <div className="login-tester-container">
      <div className="dashboard-header">
        <h2>Single Site Login Tester</h2>
      </div>
      <p className="description" style={{ margin: "1rem 0" }}>
        Enter a URL to test. The server will find its password from the bulk
        sheet (Col A/C) and attempt to log in at <code>/ghost-login</code>.
      </p>

      {/* --- Input Form --- */}
      <form onSubmit={handleSubmit} className="login-tester-form">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter website URL (e.g., https://example.com)"
          className="search-filter"
          disabled={isLoading}
        />
        <button type="submit" className="scan-all-button" disabled={isLoading}>
          {isLoading ? "Testing..." : "Start Test"}
        </button>
      </form>

      {/* --- Log Container --- */}
      <div
        className="log-container"
        ref={logContainerRef}
        style={{
          backgroundColor: "#222",
          fontFamily: "monospace",
          padding: "1rem",
          height: "300px",
          overflowY: "auto",
          borderRadius: "8px",
          border: "1px solid #444",
          marginTop: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {testLogs.length === 0 && (
          <div style={{ color: "#888" }}>Logs will appear here...</div>
        )}
        {testLogs
          .slice()
          .reverse()
          .map((log, index) => (
            <div key={index} style={getLogStyle(log.level)}>
              {log.message}
            </div>
          ))}
      </div>

      {/* --- Results List --- */}
      <div className="login-tester-results">
        <h3>Test Results (Newest First)</h3>
        <ul className="results-list">
          {results.length === 0 && (
            <li className="result-item-empty">No tests run yet.</li>
          )}
          {results.map((result, index) => (
            <li
              key={index}
              className={`result-item ${
                result.status === "success"
                  ? "result-item-success"
                  : "result-item-error"
              }`}
            >
              <span className="result-url">{result.url}</span>
              <span className="result-status">{result.message}</span>
              {result.screenshot && (
                <a
                  href={`${API_BASE_URL}/${result.screenshot}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="result-link"
                >
                  View Screenshot
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default LoginTester
