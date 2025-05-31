let allOrders = [];
const VALID_STATUSES = [
  "pending",
  "pre print",
  "printing",
  "printing pay later",
  "completed",
];

async function renderOrders(
  orders,
  expandDetails = false,
  container = null
) {
  const grid = container || document.getElementById("orderGrid");
  if (!container) grid.innerHTML = "";
  for (const order of orders) {
    const card = document.createElement("div");
    card.className = "card";

    const heading = document.createElement("h2");
    heading.textContent = order.name || "Unnamed Order";
    card.appendChild(heading); // Only append ONCE

    const statusOptions = [
      "pending",
      "pre print",
      "printing",
      "printing pay later", // 🔁 fix casing here
      "completed",
    ];
    const currentStatus = (order.status || "pending").toLowerCase();

    const statusDropdown = document.createElement("select");
    statusDropdown.className = "status-dropdown";
    applyStatusColor(statusDropdown, currentStatus);

    let matched = false;

    statusOptions.forEach((status) => {
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

    // If nothing matched, fallback to 'pending'
    if (!matched) {
      statusDropdown.value = "pending";
      applyStatusColor(statusDropdown, "pending");
    } else {
      applyStatusColor(statusDropdown, currentStatus);
    }

    // If the original status is missing, push 'pending' to database
    if (!order.status || order.status.trim() === "") {
      try {
        await fetch("/dashboard/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, status: "pending" }),
        });
        console.log(
          `⏳ Auto-updated blank status to 'pending' for ${order.id}`
        );
        order.status = "pending"; // ✅ Ensure memory copy is updated too
      } catch (err) {
        console.error(
          `❌ Failed to save 'pending' status for ${order.id}`,
          err
        );
      }
    }

    // Update status in backend when changed
    statusDropdown.addEventListener("change", async () => {
      const newStatus = statusDropdown.value;
      applyStatusColor(statusDropdown, newStatus); // 🔁 update color immediately
      try {
        await fetch("/dashboard/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, status: newStatus }),
        });
        console.log(
          `✅ Status for order ${order.id} updated to ${newStatus}`
        );
      } catch (err) {
        console.error(
          `❌ Failed to update status for order ${order.id}:`,
          err
        );
      }

      // ── Re‐filter the entire grid immediately, so “Completed” cards hide/show
      const query = document.getElementById("searchInput").value;
      filterOrders(query);

    });

    const statusWrapper = document.createElement("div");
    statusWrapper.style.marginTop = "0.5rem";
    statusWrapper.appendChild(statusDropdown);
    card.appendChild(statusWrapper); // Place dropdown below the name

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

    fetch(`/dashboard/files/${order.id}`)
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
            const downloadUrl = `/dashboard/fileserve/${encodeURIComponent(
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
            downloadAll.href = `/dashboard/download-all/${order.id}`;
            downloadAll.className = "download-all-btn";
            downloadAll.textContent = "📦 Download All";
            detailsSection.appendChild(downloadAll); // ✅ append to details section
          }
        }

        const idTag = document.createElement("div");
        idTag.className = "order-id";
        idTag.textContent = `ID: ${order.id || "N/A"}`;
        card.appendChild(idTag);
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
}

function applyStatusColor(dropdown, status) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");
  dropdown.className = "status-dropdown status-" + normalized;
}

function filterOrders(query) {
  const q = query.toLowerCase();
  const isSearchActive = q.trim().length > 0; // only expand if non-empty

  const showOld = document.getElementById("showOldToggle").checked;
  const showCompleted = document.getElementById("showCompletedToggle").checked;
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const filtered = allOrders.filter((order) => {
    const submittedAt = new Date(order.submitted_at);
    const isRecent = submittedAt >= oneWeekAgo;
    if (!showOld && !isRecent) return false;

    // If “Completed” is unchecked, skip orders whose status is “completed”
    const statusLower = (order.status || "").toLowerCase().trim();
    if (!showCompleted && statusLower === "completed") return false;

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

  const existingIds = new Set(allOrders.map((order) => order.id));
  const uniqueNewOrders = newOrders.filter(
    (order) => !existingIds.has(order.id)
  );

  if (uniqueNewOrders.length === 0) return;

  for (const order of uniqueNewOrders) {
    allOrders.unshift(order);
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
  allOrders.sort(
    (a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  latestTimestamp = allOrders[0].submitted_at;
}

async function refreshOrderStatuses() {
  try {
    const response = await fetch("/dashboard/data", {
      credentials: "include" // ✅ Ensures session cookie is sent
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const latestData = await response.json();
    const grid = document.getElementById("orderGrid");
    const cards = grid.querySelectorAll(".card");

    latestData.forEach((latestOrder) => {
      const matchingCard = [...cards].find((card) =>
        card.innerText.includes(latestOrder.id)
      );

      if (matchingCard) {
        const dropdown = matchingCard.querySelector("select");
        const currentStatus = dropdown.value.toLowerCase();
        let newStatus = (latestOrder.status || "pending").toLowerCase();

        const allowedStatuses = [
          "pending",
          "pre print",
          "printing",
          "printing pay later",
          "completed"
        ];
        if (!allowedStatuses.includes(newStatus)) {
          newStatus = "pending";
        }

        if (currentStatus !== newStatus) {
          dropdown.value = newStatus;
          applyStatusColor(dropdown, newStatus);
        }
      }
    });
  } catch (err) {
    console.error("❌ Failed to refresh statuses:", err);
  }
}


// First full load
function loadInitialOrders() {
  fetch("/dashboard/data", { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      allOrders = Array.isArray(data) ? data : [];
      if (data.length > 0) latestTimestamp = data[0].submitted_at;
      const query = document.getElementById("searchInput").value;
      filterOrders(query);

      for (const order of data) {
        if (
          (order.est_price == null || order.est_price === 0) &&
          !(order.order_notes && order.order_notes.includes("Print estimate failed"))
        ) {
          await autoEstimateOrder(order);
        }
      }
    })
    .catch((err) => {
      allOrders = [];
      document.getElementById("orderGrid").innerHTML = "<p>⚠️ Failed to load orders.</p>";
      console.error("❌ Failed to loadInitialOrders:", err);
    });

}

// Only get orders submitted after the latest known one
function fetchNewOrders() {
  if (!latestTimestamp) return;

  fetch(`/dashboard/data?since=${encodeURIComponent(latestTimestamp)}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.length > 0) {
        appendNewOrders(data);
      }
    })
    .catch((err) => {
      console.error("❌ Failed to fetch new orders:", err);
    });
}

//loadInitialOrders();
//setInterval(fetchNewOrders, 10000); // Check for new orders every 30s

let searchTimeout; // Holds the timer reference

async function autoEstimateOrder(order, card) {
  try {
    const files = await fetch(`/dashboard/files/${order.id}`).then((r) =>
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

    const sseResponse = await fetch("/stl/upload", {
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
      await fetch("/dashboard/update-price", {
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
        await fetch("/dashboard/update-notes", {
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

//setInterval(refreshOrderStatuses, 10000); // every 10 seconds

document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const query = document.getElementById("searchInput").value;
    filterOrders(query);
  }, 200);
});

document.getElementById("showOldToggle").addEventListener("change", () => {
  const query = document.getElementById("searchInput").value;
  filterOrders(query);
});

document.getElementById("showCompletedToggle").addEventListener("change", () => {
  const query = document.getElementById("searchInput").value;
  filterOrders(query);
});

filterOrders("");

// ─── Login overlay logic (unchanged) ───────────────────────────────────
const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

// Auto-login if remembered
if (localStorage.getItem("rememberedUser")) {
  loginOverlay.style.display = "none";
  loadInitialOrders();
  setInterval(fetchNewOrders, 10000);
  setInterval(refreshOrderStatuses, 10000);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();
  const remember = document.getElementById("rememberMe").checked;

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);
  if (remember) formData.append("remember", "on");

  try {
    const res = await fetch("/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (res.ok) {
      if (remember) localStorage.setItem("rememberedUser", "true");
      loginOverlay.style.display = "none";

      loadInitialOrders();
      setInterval(fetchNewOrders, 10000);
      setInterval(refreshOrderStatuses, 10000);
    } else {
      let errorText = "Login failed.";
      try {
        const data = await res.json();
        errorText = data.error || errorText;
      } catch {
        const fallbackText = await res.text();
        errorText = fallbackText || errorText;
      }
      loginError.textContent = errorText;
      loginError.style.display = "block";
    }
  } catch (err) {
    loginError.textContent = "Login error. Try again.";
    loginError.style.display = "block";
  }
});