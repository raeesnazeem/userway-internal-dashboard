import React, { useState } from "react";
import "./Notification.css";

// The bell icon (as SVG)
const BellIcon = () => (
  <svg
    className="bell-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.21 1.79-4 4-4s4 1.79 4 4v6z" />
  </svg>
);

const NotificationBell = ({ notifications, unreadCount, onBellClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    // If opening, call the function from App.js to reset the count
    if (!isOpen) {
      onBellClick();
    }
  };

  return (
    <div className="notification-bell">
      <div onClick={handleToggle}>
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </div>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">Notifications</div>
          {notifications.length > 0 ? (
            <ul className="notification-list">
              {notifications.map((notif) => (
                <li key={notif.id} className="notification-item">
                  <p>{notif.change}</p>
                  <div className="message">{notif.message}</div>
                  <div className="date">{notif.date}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="no-notifications">No new notifications</div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
