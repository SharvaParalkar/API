// Dashboard state management
const DashboardState = {
  allOrders: [],
  currentUser: null,
  currentTab: "all", // "all" or "claimed"
  refreshTimers: [],
  VALID_STATUSES: [
    "pending",
    "pre print",
    "printing",
    "printing pay later",
    "completed",
  ]
};

// Add base URL for API calls
const API_BASE_URL = 'https://api.filamentbros.com';

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Error handling utility
function handleError(error, userMessage = "An error occurred") {
  console.error("❌ Error:", error);
  // You can implement a toast or notification system here
  alert(userMessage);
}

async function renderOrders(orders, expandDetails = false, container = null) {
  try {
    const grid = container || document.getElementById("orderGrid");
    if (!container) grid.innerHTML = "";
    
    for (const order of orders) {
      const card = document.createElement("div");
      card.className = "card";

      const heading = document.createElement("h2");
      heading.textContent = order.name || "Unnamed Order";
      card.appendChild(heading);

      const statusDropdown = createStatusDropdown(order);
      card.appendChild(statusDropdown);

      // Add event listener with error handling
      statusDropdown.addEventListener("change", async (e) => {
        try {
          const newStatus = e.target.value;
          await updateOrderStatus(order.id, newStatus);
          applyStatusColor(statusDropdown, newStatus);
        } catch (err) {
          handleError(err, "Failed to update order status");
          // Revert to previous status
          e.target.value = order.status;
          applyStatusColor(statusDropdown, order.status);
        }
      });

      // Show estimated price right under heading
      const price = document.createElement("p");
      price.innerHTML = `<strong>Est. Price:</strong> ${order.est_price ? `$${order.est_price.toFixed(2)}` : "—"
        }`;
      card.appendChild(price);

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "details-toggle";
      toggleBtn.textContent = "Show Details ▼";
      card.appendChild(toggleBtn);

      const detailsSection = document.createElement("div");
      detailsSection.className = "details-section";
      card.appendChild(detailsSection);

      const idLine = document.createElement("div");
      idLine.className = "order-id";
      idLine.textContent = `Order ID: ${order.id}`;
      card.appendChild(idLine);


      const table = document.createElement("table");
      table.className = "details-table";
      const submittedDate = new Date(order.submitted_at);
      const formattedDate = submittedDate.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      [
        ["Email", order.email],
        ["Phone", order.phone],
        ["Staff", order.assigned_staff || "—"],
        ["Customer Notes", order.notes || "—"],
        ["Staff Notes", order.order_notes || "—"],
        ["Submitted At", formattedDate],
      ].forEach(([label, value]) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${label}:</td><td>${value}</td>`;
        table.appendChild(row);
      });

      detailsSection.appendChild(table);

      toggleBtn.onclick = () => {
        const visible = detailsSection.classList.toggle("visible");
        toggleBtn.textContent = visible ? "Hide ▲" : "Show Details ▼";
      };

      // Expand by default if search is active
      if (expandDetails) {
        detailsSection.classList.add("visible");
        toggleBtn.textContent = "Hide ▲";
      }

      fetch(`${API_BASE_URL}/dashboard/files/${order.id}`)
        .then((res) => res.json())
        .then((files) => {
          if (files.length > 0) {
            const stlTitle = document.createElement("p");
            stlTitle.className = "stl-header";
            stlTitle.textContent = "STL Files:";
            detailsSection.appendChild(stlTitle); // ✅ append to details section

            const list = document.createElement("ul");
            list.className = "stl-list";

            files.forEach((fileUrl) => {
              const fullFilename = decodeURIComponent(
                fileUrl.split("/").pop()
              );
              const downloadUrl = `${API_BASE_URL}/dashboard/fileserve/${encodeURIComponent(
                fullFilename
              )}`;
              const filename = fullFilename.replace(
                /^order[_-]?[a-zA-Z0-9]+[_-]/i,
                ""
              );

              const li = document.createElement("li");
              li.innerHTML = `
                          <a href="${downloadUrl}" title="${filename}" class="stl-link" download target="_blank">
                            ${filename}
                          </a>`;
              list.appendChild(li);
            });

            detailsSection.appendChild(list); // ✅ append to details section

            if (files.length > 0) {
              const downloadAll = document.createElement("a");
              downloadAll.href = `${API_BASE_URL}/dashboard/download-all/${order.id}`;
              downloadAll.className = "download-all-btn";
              downloadAll.textContent = "📦 Download All";
              detailsSection.appendChild(downloadAll); // ✅ append to details section
            }
          }

          const isClaimed = order.claimed === true;
          const isCompleted = order.status?.toLowerCase() === "completed";
          const claimedByCurrentUser = order.assigned_staff === DashboardState.currentUser;

          if (DashboardState.currentTab === "claimed") {
            // Show "Unclaim" button in Claimed tab if claimed by current user
            if (claimedByCurrentUser) {
              const unclaimBtn = document.createElement("button");
              unclaimBtn.textContent = "Unclaim";
              unclaimBtn.style.backgroundColor = "#ccc";
              unclaimBtn.style.border = "none";
              unclaimBtn.style.color = "#333";
              unclaimBtn.style.padding = "0.5rem 1rem";
              unclaimBtn.style.borderRadius = "0.5rem";
              unclaimBtn.style.marginTop = "0.5rem";
              unclaimBtn.style.cursor = "pointer";

              unclaimBtn.addEventListener("click", async () => {
                const success = await unclaimOrder(order);
                if (success) {
                  const query = document.getElementById("searchInput").value;
                  filterOrders(query);
                }
              });

              card.appendChild(unclaimBtn);
            } else {
              // Show who claimed it
              const claimedLabel = document.createElement("div");
              claimedLabel.textContent = `Claimed by: ${order.assigned_staff}`;
              claimedLabel.style.marginTop = "0.5rem";
              claimedLabel.style.fontSize = "0.9rem";
              claimedLabel.style.color = "#666";
              card.appendChild(claimedLabel);
            }
          } else {
            // Don't show claim button for completed orders
            if (isCompleted) {
              const completedLabel = document.createElement("button");
              completedLabel.textContent = "Completed";
              completedLabel.disabled = true;
              completedLabel.style.backgroundColor = "#999";
              completedLabel.style.border = "none";
              completedLabel.style.color = "#666";
              completedLabel.style.padding = "0.5rem 1rem";
              completedLabel.style.borderRadius = "0.5rem";
              completedLabel.style.marginTop = "0.5rem";
              completedLabel.style.cursor = "not-allowed";
              card.appendChild(completedLabel);
            } else if (isClaimed) {
              // Show who claimed it
              const claimedLabel = document.createElement("div");
              claimedLabel.textContent = `Claimed by: ${order.assigned_staff}`;
              claimedLabel.style.marginTop = "0.5rem";
              claimedLabel.style.fontSize = "0.9rem";
              claimedLabel.style.color = "#666";
              card.appendChild(claimedLabel);

              // Add unclaim button if claimed by current user
              if (claimedByCurrentUser) {
                const unclaimBtn = document.createElement("button");
                unclaimBtn.textContent = "Unclaim";
                unclaimBtn.style.backgroundColor = "#ccc";
                unclaimBtn.style.border = "none";
                unclaimBtn.style.color = "#333";
                unclaimBtn.style.padding = "0.5rem 1rem";
                unclaimBtn.style.borderRadius = "0.5rem";
                unclaimBtn.style.marginTop = "0.5rem";
                unclaimBtn.style.cursor = "pointer";

                unclaimBtn.addEventListener("click", async () => {
                  const success = await unclaimOrder(order);
                  if (success) {
                    const query = document.getElementById("searchInput").value;
                    filterOrders(query);
                  }
                });

                card.appendChild(unclaimBtn);
              }
            } else {
              // Show claim button for unclaimed orders
              const claimBtn = document.createElement("button");
              claimBtn.textContent = "Claim Order";
              claimBtn.style.backgroundColor = "#ccc";
              claimBtn.style.border = "none";
              claimBtn.style.color = "#333";
              claimBtn.style.padding = "0.5rem 1rem";
              claimBtn.style.borderRadius = "0.5rem";
              claimBtn.style.marginTop = "0.5rem";
              claimBtn.style.cursor = "pointer";

              claimBtn.addEventListener("click", async () => {
                const success = await claimOrder(order);
                if (success) {
                  const query = document.getElementById("searchInput").value;
                  filterOrders(query);
                }
              });

              card.appendChild(claimBtn);
            }
          }


        })

        .catch((err) => {
          console.error(`❌ Failed to load STL files for ${order.id}`, err);
        });

      grid.appendChild(card);

      if (
        (order.est_price == null || order.est_price === 0) &&
        !(
          order.order_notes &&
          order.order_notes.includes("Print estimate failed")
        )
      ) {
        autoEstimateOrder(order, card);
      }
    }
  } catch (err) {
    handleError(err, "Failed to render orders");
  }
}

function createStatusDropdown(order) {
  const statusDropdown = document.createElement("select");
  statusDropdown.className = "status-dropdown";
  
  const currentStatus = (order.status || "pending").toLowerCase();
  applyStatusColor(statusDropdown, currentStatus);

  let matched = false;

  DashboardState.VALID_STATUSES.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    if (status.toLowerCase() === currentStatus.toLowerCase()) {
      option.selected = true;
      matched = true;
    }
    statusDropdown.appendChild(option);
  });

  if (!matched) {
    statusDropdown.value = "pending";
    applyStatusColor(statusDropdown, "pending");
  }

  return statusDropdown;
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/status/${orderId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: newStatus }),
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Failed to update status: ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    throw new Error(`Failed to update order status: ${err.message}`);
  }
}

function applyStatusColor(dropdown, status) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");
  dropdown.className = "status-dropdown status-" + normalized;
}

function filterOrders(query) {
  const q = query.toLowerCase();
  const isSearchActive = q.trim().length > 0;

  const showOld = document.getElementById("showOldToggle").checked;
  const showCompleted = document.getElementById("showCompletedToggle").checked;

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const filtered = DashboardState.allOrders.filter((order) => {
    const submittedAt = new Date(order.submitted_at);
    const isRecent = submittedAt >= oneWeekAgo;
    if (!showOld && !isRecent) return false;
    if (!showCompleted && (order.status || "").toLowerCase() === "completed") return false;
    
    // Handle claimed tab
    if (DashboardState.currentTab === "claimed") {
      // In claimed tab, only show orders claimed by current user
      if (!order.claimed || order.assigned_staff !== DashboardState.currentUser) {
        return false;
      }
    }

    return (
      (order.name && order.name.toLowerCase().includes(q)) ||
      (order.email && order.email.toLowerCase().includes(q)) ||
      (order.phone && order.phone.toLowerCase().includes(q)) ||
      (order.id &&
        (order.id.toLowerCase().includes(q) ||
          order.id.replace(/^order_/, "").includes(q)))
    );
  });

  renderOrders(filtered, isSearchActive);
}

let latestTimestamp = null;

// Append new orders to the list and render

function renderOrdersToContainer(orders, container) {
  renderOrders(orders, false, container);
}

async function appendNewOrders(newOrders) {
  if (newOrders.length === 0) return;

  const existingIds = new Set(DashboardState.allOrders.map((order) => order.id));
  const uniqueNewOrders = newOrders.filter(
    (order) => !existingIds.has(order.id)
  );

  if (uniqueNewOrders.length === 0) return;

  for (const order of uniqueNewOrders) {
    DashboardState.allOrders.unshift(order);
    const query = document.getElementById("searchInput").value;
    if (!query.trim()) {
      // Only append if not in a filtered search view
      const grid = document.getElementById("orderGrid");
      const tempOrders = [order];
      const tempHTML = document.createElement("div");
      renderOrdersToContainer(tempOrders, tempHTML); // custom helper
      grid.prepend(...tempHTML.children);
    } // Reuse main render function to show correctly

    // Trigger auto estimate if missing
    if (
      (order.est_price == null || order.est_price === 0) &&
      !(
        order.order_notes &&
        order.order_notes.includes("Print estimate failed")
      )
    ) {
      await autoEstimateOrder(order);
    }
  }

  // Update latest timestamp
  DashboardState.allOrders.sort(
    (a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  latestTimestamp = DashboardState.allOrders[0].submitted_at;
}

async function refreshOrderStatuses() {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/data`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const latestData = await response.json();
    const grid = document.getElementById("orderGrid");
    const cards = grid.querySelectorAll(".card");

    // Update local state first
    latestData.forEach((latestOrder) => {
      const existingOrderIndex = DashboardState.allOrders.findIndex(o => o.id === latestOrder.id);
      if (existingOrderIndex !== -1) {
        DashboardState.allOrders[existingOrderIndex] = {
          ...DashboardState.allOrders[existingOrderIndex],
          ...latestOrder
        };
      }
    });

    // Then update UI
    latestData.forEach((latestOrder) => {
      const matchingCard = [...cards].find((card) =>
        card.innerText.includes(latestOrder.id)
      );

      if (matchingCard) {
        // Update status dropdown
        const dropdown = matchingCard.querySelector("select");
        const currentStatus = dropdown.value.toLowerCase();
        let newStatus = (latestOrder.status || "pending").toLowerCase();

        const allowedStatuses = DashboardState.VALID_STATUSES;
        if (!allowedStatuses.includes(newStatus)) {
          newStatus = "pending";
        }

        if (currentStatus !== newStatus) {
          dropdown.value = newStatus;
          applyStatusColor(dropdown, newStatus);
        }

        // Update claim status
        const existingClaimBtn = matchingCard.querySelector("button:not(.details-toggle)");
        const existingClaimLabel = matchingCard.querySelector("div:not(.order-id):not(.details-section)");
        
        if (existingClaimBtn) existingClaimBtn.remove();
        if (existingClaimLabel) existingClaimLabel.remove();

        // Re-add claim/unclaim UI
        if (latestOrder.status?.toLowerCase() !== "completed") {
          if (latestOrder.assigned_staff === DashboardState.currentUser) {
            const unclaimBtn = document.createElement("button");
            unclaimBtn.textContent = "Unclaim";
            unclaimBtn.style.backgroundColor = "#ccc";
            unclaimBtn.style.border = "none";
            unclaimBtn.style.color = "#333";
            unclaimBtn.style.padding = "0.5rem 1rem";
            unclaimBtn.style.borderRadius = "0.5rem";
            unclaimBtn.style.marginTop = "0.5rem";
            unclaimBtn.style.cursor = "pointer";

            unclaimBtn.addEventListener("click", async () => {
              const success = await unclaimOrder(latestOrder);
              if (success) {
                const query = document.getElementById("searchInput").value;
                filterOrders(query);
              }
            });

            matchingCard.appendChild(unclaimBtn);
          } else if (latestOrder.assigned_staff) {
            const claimedLabel = document.createElement("div");
            claimedLabel.textContent = `Claimed by: ${latestOrder.assigned_staff}`;
            claimedLabel.style.marginTop = "0.5rem";
            claimedLabel.style.fontSize = "0.9rem";
            claimedLabel.style.color = "#666";
            matchingCard.appendChild(claimedLabel);
          } else {
            const claimBtn = document.createElement("button");
            claimBtn.textContent = "Claim Order";
            claimBtn.style.backgroundColor = "#ccc";
            claimBtn.style.border = "none";
            claimBtn.style.color = "#333";
            claimBtn.style.padding = "0.5rem 1rem";
            claimBtn.style.borderRadius = "0.5rem";
            claimBtn.style.marginTop = "0.5rem";
            claimBtn.style.cursor = "pointer";

            claimBtn.addEventListener("click", async () => {
              const success = await claimOrder(latestOrder);
              if (success) {
                const query = document.getElementById("searchInput").value;
                filterOrders(query);
              }
            });

            matchingCard.appendChild(claimBtn);
          }
        }
      }
    });
  } catch (err) {
    console.error("❌ Failed to refresh statuses:", err);
  }
}

// Improved order fetching with error handling
async function loadInitialOrders() {
  try {
    const showOld = document.getElementById("showOldToggle").checked;
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const url = showOld 
      ? `${API_BASE_URL}/dashboard/data`
      : `${API_BASE_URL}/dashboard/data?since=${encodeURIComponent(oneWeekAgo.toISOString())}`;

    const response = await fetch(url, { credentials: "include" });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data = await response.json();
    DashboardState.allOrders = Array.isArray(data) ? data : [];
    
    const query = document.getElementById("searchInput").value;
    filterOrders(query);
  } catch (err) {
    handleError(err, "Failed to load orders");
    DashboardState.allOrders = [];
  }
}

// Debounced search function
const debouncedFilterOrders = debounce((query) => {
  filterOrders(query);
}, 300);

// Login handling
async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const rememberMe = document.getElementById("rememberMe").checked;
  const loginError = document.getElementById("loginError");
  const loginSpinner = document.getElementById("loginSpinner");
  const loginOverlay = document.getElementById("loginOverlay");

  loginError.style.display = "none";
  loginSpinner.style.display = "block";

  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        username,
        password,
        remember: rememberMe ? "on" : "off"
      })
    });

    if (response.ok) {
      // Store username for auto-login
      if (rememberMe) {
        localStorage.setItem("rememberedUser", username);
      } else {
        localStorage.removeItem("rememberedUser");
      }
      
      // Set current user and hide login overlay
      DashboardState.currentUser = username;
      loginOverlay.style.display = "none";
      
      // Load initial data
      await loadInitialOrders();
      startRefreshTimers();
    } else {
      const errorText = await response.text();
      loginError.textContent = errorText || "Login failed";
      loginError.style.display = "block";
    }
  } catch (err) {
    loginError.textContent = "Network error. Please try again.";
    loginError.style.display = "block";
    console.error("Login error:", err);
  } finally {
    loginSpinner.style.display = "none";
  }
}

async function checkAutoLogin(loginOverlay) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/whoami`, {
      credentials: "include",
      headers: {
        "Cache-Control": "no-cache"
      }
    });
    
    if (!response.ok) {
      throw new Error("Not authenticated");
    }

    const data = await response.json();
    
    if (data.username) {
      DashboardState.currentUser = data.username;
      loginOverlay.style.display = "none";
      await loadInitialOrders();
      startRefreshTimers();
    } else {
      // Clear remembered user if session is invalid
      localStorage.removeItem("rememberedUser");
      loginOverlay.style.display = "flex";
    }
  } catch (err) {
    console.warn("Auto-login failed:", err);
    localStorage.removeItem("rememberedUser");
    loginOverlay.style.display = "flex";
  }
}

function setupEventListeners() {
  // Search input with debouncing
  document.getElementById("searchInput").addEventListener("input", (e) => {
    debouncedFilterOrders(e.target.value);
  });

  // Tab switching
  document.getElementById("tabAll").addEventListener("click", () => {
    DashboardState.currentTab = "all";
    updateTabStyles();
    const query = document.getElementById("searchInput").value;
    filterOrders(query);
  });

  // Toggle handlers
  document.getElementById("showOldToggle").addEventListener("change", loadInitialOrders);
  document.getElementById("showCompletedToggle").addEventListener("change", () => {
    const query = document.getElementById("searchInput").value;
    filterOrders(query);
  });

  // Login form handler
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
}

// Initialize dashboard
document.addEventListener("DOMContentLoaded", () => {
  const loginOverlay = document.getElementById("loginOverlay");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  // Auto-login if remembered
  if (localStorage.getItem("rememberedUser")) {
    checkAutoLogin(loginOverlay);
  } else {
    loginOverlay.style.display = "flex";
  }

  // Setup event listeners
  setupEventListeners();
});

async function autoEstimateOrder(order, card) {
  try {
    const files = await fetch(`${API_BASE_URL}/dashboard/files/${order.id}`).then((r) =>
      r.json()
    );
    if (!files.length) {
      console.log(`⏭️ Skipped ${order.id} — No STL files found.`);
      return;
    }

    const formData = new FormData();
    const fileNames = [];

    for (const fileUrl of files) {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const filename = decodeURIComponent(fileUrl.split("/").pop());
      formData.append("stl", blob, filename);
      fileNames.push(filename);
    }

    const sseResponse = await fetch(`${API_BASE_URL}/stl/upload`, {
      method: "POST",
      headers: {
        Origin: "https://filamentbros.com",
      },
      body: formData,
    });

    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let totalEstimate = 0;
    let failedFiles = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop(); // Keep last incomplete

      for (const event of events) {
        if (event.startsWith("data:")) {
          const data = JSON.parse(event.replace("data:", "").trim());
          if (data.status === "success" && data.price) {
            totalEstimate += parseFloat(data.price);
          } else if (data.status === "error") {
            failedFiles.push(data.file || "Unknown file");
          }
        }
      }
    }

    if (totalEstimate > 0) {
      await fetch(`${API_BASE_URL}/dashboard/update-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          est_price: totalEstimate.toFixed(2),
        }),
      });
      console.log(
        `✅ Updated order ${order.id
        } with estimate $${totalEstimate.toFixed(2)}`
      );
    }

    if (card) {
      const priceLine = card.querySelector("p");
      if (priceLine) {
        priceLine.innerHTML = `<strong>Est. Price:</strong> $${totalEstimate.toFixed(
          2
        )}`;
      }

      if (failedFiles.length > 0) {
        const message = `⚠️ Print estimate failed for: ${failedFiles.join(
          ", "
        )}`;

        // Update in database
        await fetch(`${API_BASE_URL}/dashboard/update-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            order_notes: message,
          }),
        });

        // Update UI immediately
        const notesLine = [...card.querySelectorAll("li")].find((li) =>
          li.innerHTML.includes("Staff Notes:")
        );
        if (notesLine) {
          notesLine.innerHTML = `<strong>Staff Notes:</strong> ${message}`;
        }
      }
    }
  } catch (err) {
    console.error(
      `❌ Failed to auto-estimate for order ${order.id}:`,
      err
    );
  }
}

document.getElementById("tabAll").addEventListener("click", () => {
  DashboardState.currentTab = "all";
  updateTabStyles();
  const query = document.getElementById("searchInput").value;
  filterOrders(query);
});

document.getElementById("tabClaimed").addEventListener("click", () => {
  DashboardState.currentTab = "claimed";
  updateTabStyles();
  const query = document.getElementById("searchInput").value;
  filterOrders(query);
});

function updateTabStyles() {
  document.getElementById("tabAll").style.backgroundColor = DashboardState.currentTab === "all" ? "#1f6463" : "#ccc";
  document.getElementById("tabAll").style.color = DashboardState.currentTab === "all" ? "white" : "black";
  document.getElementById("tabClaimed").style.backgroundColor = DashboardState.currentTab === "claimed" ? "#1f6463" : "#ccc";
  document.getElementById("tabClaimed").style.color = DashboardState.currentTab === "claimed" ? "white" : "black";
}

async function claimOrder(order) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ orderId: order.id })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to claim order');
    }

    // Update local state
    const orderIndex = DashboardState.allOrders.findIndex(o => o.id === order.id);
    if (orderIndex !== -1) {
      DashboardState.allOrders[orderIndex] = {
        ...DashboardState.allOrders[orderIndex],
        claimed: true,
        assigned_staff: DashboardState.currentUser
      };
    }
    
    // Force refresh to ensure UI is updated
    await refreshOrderStatuses();
    return true;
  } catch (err) {
    handleError(err, `Failed to claim order: ${err.message}`);
    return false;
  }
}

async function unclaimOrder(order) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/unclaim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ orderId: order.id })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to unclaim order');
    }

    // Update local state
    const orderIndex = DashboardState.allOrders.findIndex(o => o.id === order.id);
    if (orderIndex !== -1) {
      DashboardState.allOrders[orderIndex] = {
        ...DashboardState.allOrders[orderIndex],
        claimed: false,
        assigned_staff: null
      };
    }
    
    // Force refresh to ensure UI is updated
    await refreshOrderStatuses();
    return true;
  } catch (err) {
    handleError(err, `Failed to unclaim order: ${err.message}`);
    return false;
  }
}

function startRefreshTimers() {
  // Clear existing timers
  DashboardState.refreshTimers.forEach(clearInterval);
  DashboardState.refreshTimers = [];

  // Start new timers
  DashboardState.refreshTimers.push(
    setInterval(fetchNewOrders, 10000),
    setInterval(refreshOrderStatuses, 10000)
  );
}
