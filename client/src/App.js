// import React, { useState, useEffect } from "react";
// import axios from "axios";
// import { io } from "socket.io-client";
// import DataTable, { ScanCell } from "./components/DataTable";
// import NotificationBell from "./components/Notification";
// import "./App.css";

// // --- Configuration ---
// const API_BASE_URL = "http://localhost:3001";
// const SOCKET_URL = "http://localhost:3001";

// // --- Mappings for Master Sheet ---
// const EXISTING_COL_DATE = 1; // Column B
// const EXISTING_COL_PROJECT = 3; // Column D

// const NEW_COL_DATE = 0; // Column A
// const NEW_COL_PROJECT = 3; // Column D

// // --- Mappings for URL Lookup Sheet (ADA Duplicate Sheet) ---
// const URL_COL_PROJECT = 0; // Column A (Project Name)
// const URL_COL_URL = 1; // Column B (The URL)
// const URL_COL_DEACTIVATION_DATE = 5; // Column F (Deactivation Date)

// // --- Mappings for History Sheet (ADA Pro Sheet) ---
// const HISTORY_COL_URL = 1; // Column B (URL to match cancellation)
// const HISTORY_COL_CANCELLED_STATUS = 6; // Column G (Cancellation Status)

// // --- Basecamp Search URL ---
// const BASECAMP_SEARCH_URL = "https://3.basecamp.com/4023059/search?q=";

// // --- Category Filter ---
// const CATEGORIES = [
//   "All",
//   "Do Not Add",
//   "Annual",
//   "Blanks",
//   "Basic",
//   "Cancelled",
//   "Deactivated",
// ];

// // --- Main App Component ---
// function App() {
//   const [activeTab, setActiveTab] = useState("master");
//   const [masterData, setMasterData] = useState([]);
//   const [historyData, setHistoryData] = useState([]);
//   const [scanStatus, setScanStatus] = useState({});

//   // --- State for filters ---
//   const [searchTerm, setSearchTerm] = useState("");
//   const [activeCategory, setActiveCategory] = useState("All");
//   const [historySearchTerm, setHistorySearchTerm] = useState("");
//   const [historySortOrder, setHistorySortOrder] = useState("asc");

//   const [isScanningAll, setIsScanningAll] = useState(false);
//   const [notifications, setNotifications] = useState([]);
//   const [unreadCount, setUnreadCount] = useState(0);
//   const [socket, setSocket] = useState(null);

//   // --- Data Fetching ---

//   const fetchMasterData = async () => {

//     console.log("Fetching all master data...");
//     try {
//       const [existingRes, newRes, urlRes, historyRes] = await Promise.all([
//         axios.get(`${API_BASE_URL}/api/existing-data`),
//         axios.get(`${API_BASE_URL}/api/new-data`),
//         axios.get(`${API_BASE_URL}/api/url-data`),
//         axios.get(`${API_BASE_URL}/api/history-data`),
//       ]);
//       const urlMap = new Map();
//       const deactivationMap = new Map();
//       const urlData = urlRes.data.slice(1);
//       for (const row of urlData) {
//         const projectName = row[URL_COL_PROJECT];
//         const url = row[URL_COL_URL];
//         const deactivationDate = row[URL_COL_DEACTIVATION_DATE];
//         if (projectName) {
//           const normalizedName = projectName.toLowerCase().trim();
//           if (url) urlMap.set(normalizedName, url);
//           if (deactivationDate)
//             deactivationMap.set(normalizedName, deactivationDate);
//         }
//       }
//       const cancellationMap = new Map();
//       const historyDataRaw = historyRes.data.slice(1);
//       for (const row of historyDataRaw) {
//         const url = row[HISTORY_COL_URL];
//         const cancelledStatus = row[HISTORY_COL_CANCELLED_STATUS];
//         if (
//           url &&
//           cancelledStatus &&
//           cancelledStatus.toLowerCase().includes("cancelled client")
//         ) {
//           cancellationMap.set(url.toLowerCase().trim(), true);
//         }
//       }
//       const processedExisting = existingRes.data.slice(1).map((row, index) => {
//         const projectName = row[EXISTING_COL_PROJECT] || "";
//         const normalizedName = projectName.toLowerCase().trim();
//         const projectUrl = urlMap.get(normalizedName) || null;
//         const isCancelledMaster = (row[EXISTING_COL_DATE] || "")
//           .toLowerCase()
//           .includes("cancelled");
//         return {
//           id: `existing-${index}`,
//           date: row[EXISTING_COL_DATE],
//           projectName: projectName,
//           url: projectUrl,
//           deactivationDate: deactivationMap.get(normalizedName) || null,
//           isCancelledPro: projectUrl
//             ? cancellationMap.get(projectUrl.toLowerCase().trim()) || false
//             : false,
//           isCancelledMaster: isCancelledMaster,
//         };
//       });
//       const processedNew = newRes.data.slice(1).map((row, index) => {
//         const projectName = row[NEW_COL_PROJECT] || "";
//         const normalizedName = projectName.toLowerCase().trim();
//         const projectUrl = urlMap.get(normalizedName) || null;
//         const isCancelledMaster = (row[NEW_COL_DATE] || "")
//           .toLowerCase()
//           .includes("cancelled");
//         return {
//           id: `new-${index}`,
//           date: row[NEW_COL_DATE],
//           projectName: projectName,
//           url: projectUrl,
//           deactivationDate: deactivationMap.get(normalizedName) || null,
//           isCancelledPro: projectUrl
//             ? cancellationMap.get(projectUrl.toLowerCase().trim()) || false
//             : false,
//           isCancelledMaster: isCancelledMaster,
//         };
//       });
//       setMasterData([...processedExisting, ...processedNew]);
//       console.log("Master data processed!");
//     } catch (error) {
//       console.error("Error fetching master data:", error);
//     }
//   };

//   const fetchHistoryData = async () => {
//     // ... (This function remains unchanged)
//     try {
//       const res = await axios.get(`${API_BASE_URL}/api/history-data`);
//       const rawData = res.data.slice(1) || [];
//       const uniqueEntries = new Map();
//       for (const row of rawData) {
//         const url = row[1];
//         const date = row[5];
//         if (!url) continue;
//         const existingRow = uniqueEntries.get(url);
//         if (!existingRow || (!existingRow[5] && date)) {
//           uniqueEntries.set(url, row);
//         }
//       }
//       setHistoryData(Array.from(uniqueEntries.values()));
//     } catch (error) {
//       console.error("Error fetching history data:", error);
//       setHistoryData([]);
//     }
//   };

//   // --- Effects ---

//   useEffect(() => {
//     const newSocket = io(SOCKET_URL);
//     setSocket(newSocket);
//     newSocket.on("connect", () => console.log("Socket.io connected"));
//     newSocket.on("sheet-change", (data) => {
//       console.log("Sheet change received:", data);
//       const newNotification = { ...data, id: Date.now() };
//       setNotifications((prev) => [newNotification, ...prev]);
//       setUnreadCount((prevCount) => prevCount + 1);
//       fetchMasterData();
//       fetchHistoryData();
//     });
//     return () => newSocket.close();
//   }, []);

//   useEffect(() => {
//     fetchMasterData();
//     fetchHistoryData();
//   }, []);

//   // --- Notification ---
//   const handleBellClick = () => {
//     setUnreadCount(0);
//   };

//   // --- Scanning Functions ---
//   const handleScan = async (url, rowId) => {
//     // ... (This function remains unchanged)
//     if (!url) {
//       console.warn(`No URL for row ${rowId}, skipping scan.`);
//       setScanStatus((prev) => ({
//         ...prev,
//         [rowId]: { isLoading: false, isPresent: false, status: "No URL" },
//       }));
//       return;
//     }
//     const fullUrl = url.startsWith("http") ? url : `https://${url}`;
//     setScanStatus((prev) => ({
//       ...prev,
//       [rowId]: { isLoading: true, isPresent: false, status: "Scanning..." },
//     }));
//     if (url) {
//       try {
//         const res = await axios.post(`${API_BASE_URL}/api/scan`, {
//           url: fullUrl,
//         });
//         const { isPresent, status } = res.data;
//         setScanStatus((prev) => ({
//           ...prev,
//           [rowId]: { isLoading: false, isPresent, status },
//         }));
//         if (isPresent) {
//           await checkAndUpdateHistory(url);
//         }
//       } catch (error) {
//         console.error("Scan failed:", error);
//         setScanStatus((prev) => ({
//           ...prev,
//           [rowId]: {
//             isLoading: false,
//             isPresent: false,
//             status: "Scan Failed",
//           },
//         }));
//       }
//     } else {
//       setScanStatus((prev) => ({
//         ...prev,
//         [rowId]: { isLoading: false, isPresent: false, status: "No URL" },
//       }));
//     }
//   };

//   const handleScanAll = async () => {
//     // ... (This function remains unchanged)
//     setIsScanningAll(true);
//     const rowsToScan = [];
//     for (const project of masterData) {
//       const currentStatus = scanStatus[project.id];
//       if (
//         project.url &&
//         (!currentStatus || !currentStatus.isPresent) &&
//         !project.deactivationDate &&
//         !project.isCancelledPro &&
//         !project.isCancelledMaster
//       ) {
//         rowsToScan.push(project);
//       }
//       if (rowsToScan.length >= 100) break;
//     }
//     for (const project of rowsToScan) {
//       await handleScan(project.url, project.id);
//     }
//     setIsScanningAll(false);
//   };

//   const checkAndUpdateHistory = async (websiteUrl) => {
//     // ... (This function remains unchanged)
//     const alreadyExists = historyData.some((row) => row[1] === websiteUrl);
//     if (!alreadyExists) {
//       console.log(`Adding ${websiteUrl} to history...`);
//       try {
//         const activatedDate = new Date().toLocaleDateString();
//         await axios.post(`${API_BASE_URL}/api/add-history`, {
//           websiteUrl,
//           activatedDate,
//         });
//         fetchHistoryData();
//       } catch (error) {
//         console.error("Failed to add to history sheet:", error);
//       }
//     } else {
//       console.log(`${websiteUrl} is already in history.`);
//     }
//   };

//   // --- Render Functions ---

//   // --- renderMasterTab ---
//   const renderMasterTab = () => {
//     const filteredData = masterData

//       .filter(
//         (project) => (project.url || "").toLowerCase().trim() !== "website"
//       )
//       .filter((project) => {
//         // Filter out empty rows (Rule 5)
//         return (
//           project.date ||
//           project.projectName ||
//           project.url ||
//           project.deactivationDate ||
//           project.isCancelledPro ||
//           project.isCancelledMaster
//         );
//       })
//       .filter((project) => {
//         // Category Filter Logic
//         const projectDate = (project.date || "").toLowerCase().trim();
//         const isCancelled = project.isCancelledPro || project.isCancelledMaster;
//         const isDeactivated = !!project.deactivationDate;

//         switch (activeCategory) {
//           case "All":
//             // --- UPDATED: Rule 2 - Keep Cancelled and Deactivated in "All" ---
//             // Exclude meta rows and specific categories (excluding Cancelled/Deactivated)
//             if (projectDate === "accessiblity add-on pricing updated")
//               return false;
//             if (projectDate === "due date") return false;
//             if (projectDate === "notification status") return false;
//             if (projectDate.includes("wave")) return false;
//             if (projectDate === "") return false; // Exclude Blanks
//             if (projectDate.includes("do not add")) return false;
//             if (projectDate.includes("annual")) return false;
//             if (projectDate.includes("basic")) return false;
//             // Removed the exclusions for isCancelled and isDeactivated
//             return true; // Include everything else

//           case "Do Not Add":
//             return projectDate.includes("do not add");
//           case "Annual":
//             return projectDate.includes("annual");
//           case "Blanks":
//             return projectDate === "";
//           case "Basic":
//             return projectDate.includes("basic");
//           case "Cancelled":
//             return isCancelled; // Rule 3
//           case "Deactivated":
//             return isDeactivated; // Rule 4
//           default:
//             return true;
//         }
//       })
//       .filter((project) => {
//         // Search Filter
//         const term = searchTerm.toLowerCase();
//         if (term === "") return true;
//         const nameMatch = project.projectName.toLowerCase().includes(term);
//         const urlMatch =
//           project.url && project.url.toLowerCase().includes(term);
//         return nameMatch || urlMatch;
//       });

//     return (
//       <>
//         {/* Header remains unchanged */}
//         <div className="dashboard-header">
//           <h2>Master Project List</h2>
//           <div className="filter-controls-wrapper">
//             <input
//               type="text"
//               placeholder="Search by name or URL..."
//               className="search-filter"
//               value={searchTerm}
//               onChange={(e) => setSearchTerm(e.target.value)}
//             />
//             <div className="category-filters">
//               {CATEGORIES.map((category) => (
//                 <button
//                   key={category}
//                   className={`category-button ${
//                     activeCategory === category ? "active" : ""
//                   }`}
//                   onClick={() => setActiveCategory(category)}
//                 >
//                   {" "}
//                   {category}{" "}
//                 </button>
//               ))}
//             </div>
//           </div>
//           <button
//             className="scan-all-button"
//             onClick={handleScanAll}
//             disabled={isScanningAll}
//           >
//             {" "}
//             {isScanningAll ? "Scanning..." : "Scan All (Max 100)"}{" "}
//           </button>
//         </div>

//         <DataTable
//           headers={[
//             "Date to Activate",
//             "Project Name",
//             "Website URL",
//             "Scan",
//             "Installation Status",
//           ]}
//           rows={filteredData}
//           renderRow={(project, index) => {
//             const scanState = scanStatus[project.id] || {};
//             const isCancelled =
//               project.isCancelledPro || project.isCancelledMaster;
//             let scanCellStatus = "idle";
//             let installationStatusText = scanState.status || "---";
//             let statusClassName = "";

//             if (isCancelled) {
//               scanCellStatus = "error";
//               installationStatusText = "Cancelled Client";
//               statusClassName = "cancelled-status";
//             } else if (project.deactivationDate) {
//               scanCellStatus = "error";
//               installationStatusText = `Deactivated on ${project.deactivationDate}`;
//               statusClassName = "deactivated-status";
//             } else {
//               if (scanState.isLoading) scanCellStatus = "loading";
//               else if (scanState.isPresent) scanCellStatus = "active";
//               else if (scanState.status) scanCellStatus = "error";
//             }

//             const encodedProjectName = encodeURIComponent(project.projectName);
//             const projectLink = `${BASECAMP_SEARCH_URL}${encodedProjectName}`;

//             return (
//               <tr key={project.id}>
//                 <td>{project.date}</td>
//                 <td>
//                   {" "}
//                   <a
//                     href={projectLink}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                   >
//                     {" "}
//                     {project.projectName}{" "}
//                   </a>{" "}
//                 </td>
//                 <td>
//                   {" "}
//                   {project.url ? (
//                     <a
//                       href={
//                         project.url.startsWith("http")
//                           ? project.url
//                           : `https://${project.url}`
//                       }
//                       target="_blank"
//                       rel="noopener noreferrer"
//                     >
//                       {" "}
//                       {project.url}{" "}
//                     </a>
//                   ) : (
//                     "---"
//                   )}{" "}
//                 </td>
//                 <td>
//                   {" "}
//                   <ScanCell
//                     scanStatus={scanCellStatus}
//                     onScan={() => handleScan(project.url, project.id)}
//                   />{" "}
//                 </td>
//                 <td className={statusClassName}> {installationStatusText} </td>
//               </tr>
//             );
//           }}
//         />
//       </>
//     );
//   };

//   const renderHistoryTab = () => {
//     // ... (This function remains unchanged)
//     const parseDate = (dateStr) => {
//       /* ... unchanged ... */ if (!dateStr) return null;
//       const cleanDateStr = dateStr.trim();
//       const parts = cleanDateStr.split("/");
//       if (parts.length === 3) {
//         const month = parseInt(parts[0], 10);
//         const day = parseInt(parts[1], 10);
//         const year = parseInt(parts[2], 10);
//         if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
//           return new Date(year, month - 1, day);
//         }
//       }
//       return null;
//     };
//     const toggleHistorySort = () => {
//       setHistorySortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
//     };
//     const sortedAndFilteredHistory = historyData
//       .filter((row) => {
//         const url = row[1] || "";
//         return url.toLowerCase().includes(historySearchTerm.toLowerCase());
//       })
//       .sort((a, b) => {
//         const dateA = parseDate(a[5]);
//         const dateB = parseDate(b[5]);
//         if (dateA === null && dateB === null) return 0;
//         if (dateA === null) return historySortOrder === "asc" ? 1 : -1;
//         if (dateB === null) return historySortOrder === "asc" ? -1 : 1;
//         if (historySortOrder === "asc") {
//           return dateA - dateB;
//         } else {
//           return dateB - dateA;
//         }
//       });
//     return (
//       <>
//         {" "}
//         <div className="dashboard-header">
//           {" "}
//           <h2>Usage & History</h2>{" "}
//           <div className="filter-controls-wrapper">
//             {" "}
//             <input
//               type="text"
//               placeholder="Search by URL..."
//               className="search-filter"
//               value={historySearchTerm}
//               onChange={(e) => setHistorySearchTerm(e.target.value)}
//             />{" "}
//           </div>{" "}
//           <button className="sort-button" onClick={toggleHistorySort}>
//             {" "}
//             {`Sort Date ${
//               historySortOrder === "asc" ? "Descending" : "Ascending"
//             }`}{" "}
//           </button>{" "}
//         </div>{" "}
//         <DataTable
//           headers={["Date Activated", "Website URL"]}
//           rows={sortedAndFilteredHistory}
//           renderRow={(row, index) => (
//             <tr key={row[1] || index}>
//               {" "}
//               <td>{row[5]}</td> <td>{row[1]}</td>{" "}
//             </tr>
//           )}
//         />{" "}
//       </>
//     );
//   };

//   return (
//     <div className="App">
//       <NotificationBell
//         notifications={notifications}
//         unreadCount={unreadCount}
//         onBellClick={handleBellClick}
//       />
//       <h1>Client ADA Plugin Dashboard</h1>
//       <nav className="tab-nav">
//         {" "}
//         <button
//           className={`tab-button ${activeTab === "master" ? "active" : ""}`}
//           onClick={() => setActiveTab("master")}
//         >
//           {" "}
//           Master{" "}
//         </button>{" "}
//         <button
//           className={`tab-button ${activeTab === "history" ? "active" : ""}`}
//           onClick={() => setActiveTab("history")}
//         >
//           {" "}
//           Usage & History{" "}
//         </button>{" "}
//       </nav>
//       <main className="tab-content">
//         {" "}
//         {activeTab === "master" ? renderMasterTab() : renderHistoryTab()}{" "}
//       </main>
//     </div>
//   );
// }

// export default App;

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import DataTable, { ScanCell } from "./components/DataTable";
import NotificationBell from "./components/Notification";
import "./App.css";

// --- Configuration ---
const API_BASE_URL = "http://localhost:3001";
const SOCKET_URL = "http://localhost:3001";

// --- Mappings for Master Sheet ---
const EXISTING_COL_DATE = 1; // Column B
const EXISTING_COL_PROJECT = 3; // Column D

const NEW_COL_DATE = 0; // Column A
const NEW_COL_PROJECT = 3; // Column D

// --- Mappings for URL Lookup Sheet (ADA Duplicate Sheet) ---
const URL_COL_PROJECT = 0; // Column A (Project Name)
const URL_COL_URL = 1; // Column B (The URL)
const URL_COL_DEACTIVATION_DATE = 5; // Column F (Deactivation Date)

// --- Mappings for History Sheet (ADA Pro Sheet) ---
const HISTORY_COL_URL = 1; // Column B (URL to match cancellation)
const HISTORY_COL_CANCELLED_STATUS = 6; // Column G (Cancellation Status)

// --- Basecamp Search URL ---
const BASECAMP_SEARCH_URL = "https://3.basecamp.com/4023059/search?q=";

// --- Category Filter ---
const CATEGORIES = [
  "All",
  "Do Not Add",
  "Annual",
  "Blanks",
  "Basic",
  "Cancelled",
  "Deactivated",
];

// --- Main App Component ---
function App() {
  const [activeTab, setActiveTab] = useState("master");
  const [masterData, setMasterData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [scanStatus, setScanStatus] = useState({});

  // --- State for filters ---
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historySortOrder, setHistorySortOrder] = useState("asc");

  const [isScanningAll, setIsScanningAll] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);

  // --- State for Bulk Injector ---
  const [bulkInjectLogs, setBulkInjectLogs] = useState([]);
  const [isInjecting, setIsInjecting] = useState(false); // For stop button
  const logContainerRef = useRef(null); // To auto-scroll logs

  // --- Data Fetching ---

  const fetchMasterData = async () => {
    console.log("Fetching all master data...");
    try {
      const [existingRes, newRes, urlRes, historyRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/existing-data`),
        axios.get(`${API_BASE_URL}/api/new-data`),
        axios.get(`${API_BASE_URL}/api/url-data`),
        axios.get(`${API_BASE_URL}/api/history-data`),
      ]);
      const urlMap = new Map();
      const deactivationMap = new Map();
      const urlData = urlRes.data.slice(1);
      for (const row of urlData) {
        const projectName = row[URL_COL_PROJECT];
        const url = row[URL_COL_URL];
        const deactivationDate = row[URL_COL_DEACTIVATION_DATE];
        if (projectName) {
          const normalizedName = projectName.toLowerCase().trim();
          if (url) urlMap.set(normalizedName, url);
          if (deactivationDate)
            deactivationMap.set(normalizedName, deactivationDate);
        }
      }
      const cancellationMap = new Map();
      const historyDataRaw = historyRes.data.slice(1);
      for (const row of historyDataRaw) {
        const url = row[HISTORY_COL_URL];
        const cancelledStatus = row[HISTORY_COL_CANCELLED_STATUS];
        if (
          url &&
          cancelledStatus &&
          cancelledStatus.toLowerCase().includes("cancelled client")
        ) {
          cancellationMap.set(url.toLowerCase().trim(), true);
        }
      }
      const processedExisting = existingRes.data.slice(1).map((row, index) => {
        const projectName = row[EXISTING_COL_PROJECT] || "";
        const normalizedName = projectName.toLowerCase().trim();
        const projectUrl = urlMap.get(normalizedName) || null;
        const isCancelledMaster = (row[EXISTING_COL_DATE] || "")
          .toLowerCase()
          .includes("cancelled");
        return {
          id: `existing-${index}`,
          date: row[EXISTING_COL_DATE],
          projectName: projectName,
          url: projectUrl,
          deactivationDate: deactivationMap.get(normalizedName) || null,
          isCancelledPro: projectUrl
            ? cancellationMap.get(projectUrl.toLowerCase().trim()) || false
            : false,
          isCancelledMaster: isCancelledMaster,
        };
      });
      const processedNew = newRes.data.slice(1).map((row, index) => {
        const projectName = row[NEW_COL_PROJECT] || "";
        const normalizedName = projectName.toLowerCase().trim();
        const projectUrl = urlMap.get(normalizedName) || null;
        const isCancelledMaster = (row[NEW_COL_DATE] || "")
          .toLowerCase()
          .includes("cancelled");
        return {
          id: `new-${index}`,
          date: row[NEW_COL_DATE],
          projectName: projectName,
          url: projectUrl,
          deactivationDate: deactivationMap.get(normalizedName) || null,
          isCancelledPro: projectUrl
            ? cancellationMap.get(projectUrl.toLowerCase().trim()) || false
            : false,
          isCancelledMaster: isCancelledMaster,
        };
      });
      setMasterData([...processedExisting, ...processedNew]);
      console.log("Master data processed!");
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  const fetchHistoryData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/history-data`);
      const rawData = res.data.slice(1) || [];
      const uniqueEntries = new Map();
      for (const row of rawData) {
        const url = row[1];
        const date = row[5];
        if (!url) continue;
        const existingRow = uniqueEntries.get(url);
        if (!existingRow || (!existingRow[5] && date)) {
          uniqueEntries.set(url, row);
        }
      }
      setHistoryData(Array.from(uniqueEntries.values()));
    } catch (error) {
      console.error("Error fetching history data:", error);
      setHistoryData([]);
    }
  };

  // --- Effects ---

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);
    newSocket.on("connect", () => console.log("Socket.io connected"));
    newSocket.on("sheet-change", (data) => {
      console.log("Sheet change received:", data);
      const newNotification = { ...data, id: Date.now() };
      setNotifications((prev) => [newNotification, ...prev]);
      setUnreadCount((prevCount) => prevCount + 1);
      fetchMasterData();
      fetchHistoryData();
    });

    // --- Socket listener for bulk inject logs ---
    newSocket.on("bulk-inject-log", (logMessage) => {
      setBulkInjectLogs((prevLogs) => [logMessage, ...prevLogs.slice(0, 200)]); // Keep last 200 logs

      // Check for end messages to re-enable button
      if (
        logMessage.includes("All done") ||
        logMessage.includes("FATAL ERROR") ||
        logMessage.includes("Process stopped by user")
      ) {
        setIsInjecting(false);
      }
    });

    return () => newSocket.close();
  }, []);

  // Auto-scroll log container
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0; // Scroll to top to see newest log
    }
  }, [bulkInjectLogs]);

  useEffect(() => {
    fetchMasterData();
    fetchHistoryData();
  }, []);

  // --- Notification ---
  const handleBellClick = () => {
    setUnreadCount(0);
  };

  // --- Scanning Functions ---
  const handleScan = async (url, rowId) => {
    if (!url) {
      console.warn(`No URL for row ${rowId}, skipping scan.`);
      setScanStatus((prev) => ({
        ...prev,
        [rowId]: { isLoading: false, isPresent: false, status: "No URL" },
      }));
      return;
    }
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    setScanStatus((prev) => ({
      ...prev,
      [rowId]: { isLoading: true, isPresent: false, status: "Scanning..." },
    }));
    try {
      const res = await axios.post(`${API_BASE_URL}/api/scan`, {
        url: fullUrl,
      });
      const { isPresent, status } = res.data;
      setScanStatus((prev) => ({
        ...prev,
        [rowId]: { isLoading: false, isPresent, status },
      }));
      if (isPresent && status === "Pro") {
        // Only add to history if it's the Pro script
        await checkAndUpdateHistory(url);
      }
    } catch (error) {
      console.error("Scan failed:", error);
      setScanStatus((prev) => ({
        ...prev,
        [rowId]: {
          isLoading: false,
          isPresent: false,
          status: "Scan Failed",
        },
      }));
    }
  };

  const handleScanAll = async () => {
    setIsScanningAll(true);
    const rowsToScan = [];
    for (const project of masterData) {
      const currentStatus = scanStatus[project.id];
      if (
        project.url &&
        (!currentStatus || !currentStatus.isPresent) &&
        !project.deactivationDate &&
        !project.isCancelledPro &&
        !project.isCancelledMaster
      ) {
        rowsToScan.push(project);
      }
      if (rowsToScan.length >= 100) break; // Limit to 100
    }
    for (const project of rowsToScan) {
      await handleScan(project.url, project.id);
    }
    setIsScanningAll(false);
  };

  const checkAndUpdateHistory = async (websiteUrl) => {
    const alreadyExists = historyData.some((row) => row[1] === websiteUrl);
    if (!alreadyExists) {
      console.log(`Adding ${websiteUrl} to history...`);
      try {
        const activatedDate = new Date().toLocaleDateString();
        await axios.post(`${API_BASE_URL}/api/add-history`, {
          websiteUrl,
          activatedDate,
        });
        fetchHistoryData();
      } catch (error) {
        console.error("Failed to add to history sheet:", error);
      }
    } else {
      console.log(`${websiteUrl} is already in history.`);
    }
  };

  // --- Render Functions ---

  // --- renderMasterTab ---
  const renderMasterTab = () => {
    const filteredData = masterData
      .filter(
        (project) => (project.url || "").toLowerCase().trim() !== "website"
      )
      .filter((project) => {
        return (
          project.date ||
          project.projectName ||
          project.url ||
          project.deactivationDate ||
          project.isCancelledPro ||
          project.isCancelledMaster
        );
      })
      .filter((project) => {
        const projectDate = (project.date || "").toLowerCase().trim();
        const isCancelled = project.isCancelledPro || project.isCancelledMaster;
        const isDeactivated = !!project.deactivationDate;

        switch (activeCategory) {
          case "All":
            if (projectDate === "accessiblity add-on pricing updated")
              return false;
            if (projectDate === "due date") return false;
            if (projectDate === "notification status") return false;
            if (projectDate.includes("wave")) return false;
            if (projectDate === "") return false;
            if (projectDate.includes("do not add")) return false;
            if (projectDate.includes("annual")) return false;
            if (projectDate.includes("basic")) return false;
            return true;
          case "Do Not Add":
            return projectDate.includes("do not add");
          case "Annual":
            return projectDate.includes("annual");
          case "Blanks":
            return projectDate === "";
          case "Basic":
            return projectDate.includes("basic");
          case "Cancelled":
            return isCancelled;
          case "Deactivated":
            return isDeactivated;
          default:
            return true;
        }
      })
      .filter((project) => {
        const term = searchTerm.toLowerCase();
        if (term === "") return true;
        const nameMatch = project.projectName.toLowerCase().includes(term);
        const urlMatch =
          project.url && project.url.toLowerCase().includes(term);
        return nameMatch || urlMatch;
      });

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
            const scanState = scanStatus[project.id] || {};
            const isCancelled =
              project.isCancelledPro || project.isCancelledMaster;
            let scanCellStatus = "idle";
            let installationStatusText = scanState.status || "---";
            let statusClassName = "";

            if (isCancelled) {
              scanCellStatus = "error";
              installationStatusText = "Cancelled Client";
              statusClassName = "cancelled-status";
            } else if (project.deactivationDate) {
              scanCellStatus = "error";
              installationStatusText = `Deactivated on ${project.deactivationDate}`;
              statusClassName = "deactivated-status";
            } else {
              if (scanState.isLoading) scanCellStatus = "loading";
              else if (scanState.isPresent) {
                scanCellStatus = "active";
                // Differentiate status text
                installationStatusText =
                  scanState.status === "Pro"
                    ? "Pro Script Active"
                    : "Basic Script Active";
                statusClassName =
                  scanState.status === "Pro" ? "pro-status" : "basic-status";
              } else if (scanState.status && scanState.status !== "Not Found") {
                scanCellStatus = "error";
                statusClassName = "error-status"; // General error status
              }
            }

            const encodedProjectName = encodeURIComponent(project.projectName);
            const projectLink = `${BASECAMP_SEARCH_URL}${encodedProjectName}`;

            return (
              <tr key={project.id}>
                <td>{project.date}</td>
                <td>
                  <a
                    href={projectLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {project.projectName}
                  </a>
                </td>
                <td>
                  {project.url ? (
                    <a
                      href={
                        project.url.startsWith("http")
                          ? project.url
                          : `https://l${project.url}`
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
            );
          }}
        />
      </>
    );
  };

  const renderHistoryTab = () => {
    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      const cleanDateStr = dateStr.trim();
      const parts = cleanDateStr.split("/");
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
          return new Date(year, month - 1, day);
        }
      }
      return null;
    };
    const toggleHistorySort = () => {
      setHistorySortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    };
    const sortedAndFilteredHistory = historyData
      .filter((row) => {
        const url = row[1] || "";
        return url.toLowerCase().includes(historySearchTerm.toLowerCase());
      })
      .sort((a, b) => {
        const dateA = parseDate(a[5]);
        const dateB = parseDate(b[5]);
        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return historySortOrder === "asc" ? 1 : -1;
        if (dateB === null) return historySortOrder === "asc" ? -1 : 1;
        if (historySortOrder === "asc") {
          return dateA - dateB;
        } else {
          return dateB - dateA;
        }
      });
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
              <td>{row[5]}</td> <td>{row[1]}</td>
            </tr>
          )}
        />
      </>
    );
  };

  // --- Render function for the Bulk Injector tab ---
  const renderBulkInjectTab = () => {
    const handleStartInject = () => {
      if (!socket) {
        setBulkInjectLogs([
          "Socket not connected. Please wait and try again.",
          ...bulkInjectLogs,
        ]);
        return;
      }
      setBulkInjectLogs([
        "Starting bulk inject... (This may take a long time)",
      ]);
      setIsInjecting(true); // Set loading state

      // Config is read from the server's index.js defaults.
      const config = {
        // You can add overrides here if you add input fields
        // e.g., sheetId: 'MY_ID_FROM_INPUT'
      };
      socket.emit("start-bulk-inject", config);
    };

    // --- NEW: Stop button handler ---
    const handleStopInject = () => {
      if (socket) {
        console.log("Emitting stop-bulk-inject");
        socket.emit("stop-bulk-inject");
      }
      // The server will send a log message "Process stopped by user"
      // which will set isInjecting to false.
      // We can also set it optimistically here.
      setIsInjecting(false);
    };

    return (
      <div>
        <div className="dashboard-header">
          <h2>Bulk UserWay Injector</h2>
          {/* --- Conditional button rendering --- */}
          {!isInjecting ? (
            <button onClick={handleStartInject} className="scan-all-button">
              Start Bulk Inject
            </button>
          ) : (
            <button
              onClick={handleStopInject}
              className="scan-all-button stop-button"
            >
              Stop Process
            </button>
          )}
        </div>
        <p className="description" style={{ margin: "1rem 0" }}>
          This tool runs a script on the server to read from a Google Sheet and
          inject the UserWay script into WordPress sites.
          <br />
          <strong>Note:</strong> All configuration (Sheet ID, credentials, ADA
          script) must be set in the <code>index.js</code> file on the server.
        </p>
        <div
          className="log-container"
          ref={logContainerRef} // Assign ref
          style={{
            backgroundColor: "#222",
            color: "#0f0",
            fontFamily: "monospace",
            padding: "1rem",
            height: "500px",
            overflowY: "auto",
            borderRadius: "8px",
            border: "1px solid #444",
            marginTop: "1rem",
            display: "flex",
            flexDirection: "column-reverse", // New logs appear at the bottom
          }}
        >
          {/* Render logs in reverse order so newest is at the top of the markup,
              but flex-direction-reverse puts it at the bottom of the view */}
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
              margin: 0,
            }}
          >
            {bulkInjectLogs.join("\n")}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      <NotificationBell
        notifications={notifications}
        unreadCount={unreadCount}
        onBellClick={handleBellClick}
      />
      <h1>Client ADA Plugin Dashboard</h1>
      <nav className="tab-nav">
        <button
          className={`tab-button ${activeTab === "master" ? "active" : ""}`}
          onClick={() => setActiveTab("master")}
        >
          Master
        </button>
        <button
          className={`tab-button ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Usage & History
        </button>
        {/* --- Tab Button --- */}
        <button
          className={`tab-button ${
            activeTab === "bulk-inject" ? "active" : ""
          }`}
          onClick={() => setActiveTab("bulk-inject")}
        >
          Bulk Inject
        </button>
      </nav>
      <main className="tab-content">
        {/* --- UPDATED: Tab Content Rendering --- */}
        {activeTab === "master" && renderMasterTab()}
        {activeTab === "history" && renderHistoryTab()}
        {activeTab === "bulk-inject" && renderBulkInjectTab()}
      </main>
    </div>
  );
}

export default App;
