import React from "react"

const TABS = [
  { id: "master", name: "Master" },
  { id: "history", name: "Usage & History" },
  { id: "installer", name: "Installer" },
  { id: "login-tester", name: "Login Tester" },
]

function TabNavigator({ activeTab, setActiveTab }) {
  return (
    <nav className="tab-nav">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.name}
        </button>
      ))}
    </nav>
  )
}

export default TabNavigator
