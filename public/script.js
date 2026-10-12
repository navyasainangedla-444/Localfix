(function () {
  var CATS = ["All", "Plumbing", "Electrical", "Cleaning", "Tutoring", "Salon", "Repairs", "Cooking"];
  var TIMES = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  var TOKEN_KEY = "localfix-token";
  var providers = [];
  var bookings = [];
  var dash = [];
  var admP = [];
  var cfg = { demoPayments: false };
  var dashFilter = "upcoming";
  var dashSeen = null; // ids seen on the last load, used to spot new bookings
  var newIds = {};
  var user = null;
  var token = readToken();
  var mode = "login";
  var state = { cat: "All", q: "", sort: "rating", pid: null };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- helpers ----------
  function readToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function saveToken(t) {
    token = t;
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function api(url, method, body) {
    var o = { method: method || "GET", headers: {} };
    if (body) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    if (token) o.headers.Authorization = "Bearer " + token;
    return fetch(url, o).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) { var e = new Error(d.error || "Request failed"); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(m) {
    var t = $("toast");
    t.textContent = m;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }
  function inr(n) { return "₹" + n.toLocaleString("en-IN"); }
  function today() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  // ---------- rendering ----------
  function renderChips() {
    $("chips").innerHTML = CATS.map(function (c) {
      return '<button class="chip" data-c="' + c + '" aria-pressed="' + (state.cat === c) + '">' + c + "</button>";
    }).join("");
  }
  function renderGrid() {
    var q = state.q.toLowerCase();
    var rows = providers.filter(function (p) {
      return (state.cat === "All" || p.cat === state.cat) &&
        (!q || (p.name + p.svc + p.cat + p.area).toLowerCase().indexOf(q) > -1);
    });
    rows.sort(function (a, b) {
      return state.sort === "low" ? a.price - b.price : state.sort === "high" ? b.price - a.price : b.rating - a.rating;
    });
    if (!rows.length) {
      $("grid").innerHTML = '<p class="empty">No providers match. Try another category or clear the search.</p>';
      return;
    }
    $("grid").innerHTML = rows.map(function (p) {
      return '<article class="card"><div class="top"><div class="av" aria-hidden="true">' + esc(p.name[0]) +
        '</div><div><h3>' + esc(p.name) + '</h3><div class="meta">' + esc(p.cat) + " · " + esc(p.area) + "</div></div></div>" +
        "<div>" + esc(p.svc) + '</div><div class="meta">★ ' + p.rating.toFixed(1) + " · " + p.jobs + " jobs done</div>" +
        '<div class="row"><div class="price">' + inr(p.price) + " <small>/ " + esc(p.unit) + '</small></div><div><button class="btn" style="background:transparent;color:var(--brand);border:1px solid var(--line);margin-right:6px" data-r="' + p._id + '">Reviews</button><button class="btn" data-b="' + p._id + '">Book</button></div></div></article>';
    }).join("");
  }
  function payTag(b) {
    if (b.paymentStatus === "paid") return '<span class="tag confirmed">Paid</span>';
    if (b.paymentStatus === "refunded") return '<span class="tag">Refunded</span>';
    return '<span class="tag">' + (b.paymentMethod === "online" ? "Payment pending" : "Pay after service") + "</span>";
  }
  function renderBookings() {
    $("cnt").textContent = bookings.filter(function (b) { return b.status === "confirmed"; }).length || "";
    if (!bookings.length) {
      $("list").innerHTML = '<p class="empty">No bookings yet. Pick a provider in Browse and choose a time.</p>';
      return;
    }
    $("list").innerHTML = bookings.map(function (b) {
      return '<article class="card"><div class="bk"><div><h3>' + esc(b.providerName) + '</h3><div class="meta">' + esc(b.svc) + "</div>" +
        "<div>" + esc(b.date) + " at " + esc(b.time) + '</div><div class="meta">' + esc(b.address) + "</div></div>" +
        '<div style="text-align:right"><span class="tag ' + b.status + '">' + b.status + '</span> ' + payTag(b) + '<div class="price" style="margin-top:6px">' + inr(b.price) + "</div>" +
        (b.status === "confirmed" && b.paymentStatus === "unpaid" && b.paymentMethod === "online"
          ? '<button class="btn" style="margin-top:8px;margin-right:6px" data-p="' + b._id + '">Pay now</button>' : "") +
        (b.status === "confirmed" ? '<button class="btn ghost" style="margin-top:8px" data-x="' + b._id + '">Cancel booking</button>' : "") +
        (b.status === "completed" && !b.rating ? '<button class="btn" style="margin-top:8px" data-t="' + b._id + '">Rate service</button>' : "") +
        (b.rating ? '<div class="meta" style="margin-top:6px">Your rating: ★ ' + b.rating + "</div>" : "") +
        "</div></div></article>";
    }).join("");
  }
  function renderDash() {
    var t = today();
    var counts = { upcoming: 0, completed: 0, cancelled: 0, all: dash.length };
    dash.forEach(function (b) {
      if (b.status === "confirmed") counts.upcoming++;
      else if (b.status === "completed") counts.completed++;
      else counts.cancelled++;
    });
    var todayN = dash.filter(function (b) { return b.status === "confirmed" && b.date === t; }).length;
    $("dstats").textContent = "Today: " + todayN + " · Upcoming: " + counts.upcoming + " · Completed: " + counts.completed + " · Total: " + dash.length;
    $("dfilter").innerHTML = ["upcoming", "completed", "cancelled", "all"].map(function (f) {
      return '<button class="chip" data-f="' + f + '" aria-pressed="' + (dashFilter === f) + '">' +
        f.charAt(0).toUpperCase() + f.slice(1) + " (" + counts[f] + ")</button>";
    }).join("");
    var rows = dash.filter(function (b) {
      if (dashFilter === "all") return true;
      if (dashFilter === "upcoming") return b.status === "confirmed";
      return b.status === dashFilter;
    });
    if (!rows.length) {
      $("dlist").innerHTML = '<p class="empty">' + (dash.length
        ? "No " + dashFilter + " bookings."
        : "No bookings yet. When a customer books you, it will appear here.") + "</p>";
      return;
    }
    $("dlist").innerHTML = rows.map(function (b) {
      return '<article class="card"><div class="bk"><div><h3>' + esc(b.name) + " · " + esc(b.phone) + '</h3><div class="meta">' + esc(b.svc) + "</div>" +
        "<div>" + esc(b.date) + " at " + esc(b.time) + '</div><div class="meta">' + esc(b.address) + (b.note ? " · " + esc(b.note) : "") + "</div></div>" +
        '<div style="text-align:right"><span class="tag ' + b.status + '">' + b.status + "</span> " + (newIds[b._id] ? '<span class="tag" style="background:var(--accent);color:#2a1a00">NEW</span> ' : "") + payTag(b) +
        '<div class="price" style="margin-top:6px">' + inr(b.price) + "</div>" +
        (b.rating ? '<div class="meta">★ ' + b.rating + (b.review ? " · " + esc(b.review) : "") + "</div>" : "") +
        (b.status === "confirmed" ? '<button class="btn" style="margin-top:8px" data-d="' + b._id + '">Mark completed</button>' : "") +
        "</div></div></article>";
    }).join("");
  }
  function show(tab) {
    $("browse").hidden = tab !== "browse";
    $("mine").hidden = tab !== "mine";
    $("dash").hidden = tab !== "dash";
    $("adm").hidden = tab !== "adm";
    $("nBrowse").setAttribute("aria-pressed", tab === "browse");
    $("nBook").setAttribute("aria-pressed", tab === "mine");
    $("nDash").setAttribute("aria-pressed", tab === "dash");
    $("nAdm").setAttribute("aria-pressed", tab === "adm");
  }

  // ---------- login state ----------
  function setUser(u) {
    user = u;
    var cust = !!u && u.role === "customer";
    var prov = !!u && u.role === "provider";
    var adm = !!u && u.role === "admin";
    $("nBook").hidden = !cust;
    $("nDash").hidden = !prov;
    $("nAdm").hidden = !adm;
    $("nAuth").textContent = u ? "Logout (" + u.name.split(" ")[0] + ")" : "Login";
    bookings = [];
    dash = [];
    renderBookings();
    renderDash();
    admP = [];
    dashSeen = null;
    newIds = {};
    renderAdmin();
    show(prov ? "dash" : adm ? "adm" : "browse");
    if (cust) loadBookings();
    if (prov) loadDash();
    if (adm) loadAdmin();
  }
  function setMode(m) {
    mode = m;
    $("at").textContent = m === "login" ? "Login" : "Create account";
    $("ab").textContent = m === "login" ? "Login" : "Sign up";
    $("atg").textContent = m === "login" ? "New here? Create an account" : "Already have an account? Login";
    $("sgn").hidden = m === "login";
    $("apw").autocomplete = m === "login" ? "current-password" : "new-password";
    $("aerr").textContent = "";
  }
  function openAuth(m) { setMode(m); $("adlg").showModal(); }
  function logout() { saveToken(""); setUser(null); toast("Logged out"); }

  // ---------- data loading ----------
  function loadBookings() {
    return api("/api/bookings").then(function (rows) {
      bookings = rows;
      renderBookings();
    }).catch(function (e) { toast(e.message); });
  }
  function loadDash() {
    return api("/api/provider/bookings").then(function (rows) {
      if (dashSeen) {
        rows.forEach(function (b) {
          if (!dashSeen[b._id]) {
            newIds[b._id] = true;
            toast("New booking from " + b.name + " on " + b.date + " at " + b.time);
          }
        });
      }
      dashSeen = {};
      rows.forEach(function (b) { dashSeen[b._id] = true; });
      dash = rows;
      renderDash();
    }).catch(function (e) { toast(e.message); });
  }

  // ---------- booking popup ----------
  function openBook(id) {
    if (!user) { toast("Please log in to book"); openAuth("login"); return; }
    if (user.role !== "customer") { toast("Only customer accounts can book services"); return; }
    var p = providers.filter(function (x) { return x._id === id; })[0];
    if (!p) return;
    state.pid = id;
    $("dt").textContent = "Book " + p.name;
    $("ds").textContent = p.svc + " · " + inr(p.price) + " / " + p.unit;
    $("fn").value = user.name || "";
    $("fp").value = user.phone || "";
    $("fd").min = today();
    $("fd").value = today();
    $("fe").textContent = "";
    refreshTimes();
    $("dlg").showModal();
  }
  function refreshTimes() {
    var date = $("fd").value;
    api("/api/slots?provider=" + state.pid + "&date=" + date).then(function (taken) {
      var now = new Date();
      var isToday = date === today();
      $("ft").innerHTML = TIMES.map(function (x) {
        var past = isToday && parseInt(x, 10) <= now.getHours();
        var booked = taken.indexOf(x) > -1;
        return '<option value="' + x + '"' + (booked || past ? " disabled" : "") + ">" + x + (booked ? " (booked)" : "") + "</option>";
      }).join("");
      var first = Array.prototype.filter.call($("ft").options, function (o) { return !o.disabled; })[0];
      if (first) $("ft").value = first.value;
    }).catch(function (e) { $("fe").textContent = e.message; });
  }
  function submitBooking(e) {
    e.preventDefault();
    var body = {
      provider: state.pid,
      name: $("fn").value.trim(),
      phone: $("fp").value.replace(/\s/g, ""),
      date: $("fd").value,
      time: $("ft").value,
      address: $("fa").value.trim(),
      note: $("fnote").value.trim(),
      paymentMethod: document.querySelector('input[name="pm"]:checked').value,
    };
    $("sb").disabled = true;
    api("/api/bookings", "POST", body).then(function (b) {
      $("dlg").close();
      $("f").reset();
      toast("Booked " + b.providerName + " on " + b.date + " at " + b.time);
      return loadBookings().then(function () {
        if (body.paymentMethod === "online") return pay(b._id);
      });
    }).catch(function (err) {
      $("fe").textContent = err.message;
      refreshTimes();
    }).then(function () { $("sb").disabled = false; });
  }

  // ---------- online payment (Razorpay Checkout) ----------
  function pay(id) {
    if (cfg.demoPayments) return openDemoPay(id);
    if (typeof Razorpay === "undefined") { toast("Payment script did not load. Check your internet."); return Promise.resolve(); }
    return api("/api/payments/order", "POST", { bookingId: id }).then(function (o) {
      var rz = new Razorpay({
        key: o.keyId, amount: o.amount, currency: o.currency, order_id: o.orderId,
        name: "Localfix", description: "Service booking",
        prefill: { name: user.name, email: user.email, contact: user.phone }, theme: { color: "#0F4C45" },
        handler: function (r) {
          api("/api/payments/verify", "POST", {
            bookingId: id,
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          }).then(function () {
            toast("Payment successful");
            return loadBookings();
          }).catch(function (e) { toast(e.message); });
        },
      });
      rz.on("payment.failed", function () { toast("Payment failed. You can retry from My bookings."); });
      rz.open();
    }).catch(function (e) { toast(e.message); });
  }

  // ---------- demo payment screen (no real money) ----------
  var demoId = null;
  var demoLabel = "Pay";
  function setDemoMethod() {
    var m = $("dm").value;
    $("dupi").hidden = m !== "upi";
    $("dcard").hidden = m !== "card";
    $("dbank").hidden = m !== "bank";
  }
  function openDemoPay(id) {
    var b = bookings.filter(function (x) { return x._id === id; })[0];
    if (!b) return Promise.resolve();
    demoId = id;
    demoLabel = "Pay " + inr(b.price);
    $("dinfo").textContent = b.providerName + " · " + b.svc + " · " + inr(b.price);
    $("dpb").textContent = demoLabel;
    $("derr").textContent = "";
    $("dm").value = "upi";
    setDemoMethod();
    $("ddlg").showModal();
    return Promise.resolve();
  }

  // ---------- admin ----------
  var editId = null;
  function loadAdmin() {
    return Promise.all([api("/api/admin/stats"), api("/api/admin/providers")]).then(function (r) {
      var s = r[0];
      admP = r[1];
      $("astats").textContent = s.providers + " providers · " + s.customers + " customers · " + s.bookings + " bookings · " +
        s.completed + " completed · " + inr(s.revenue) + " paid";
      renderAdmin();
    }).catch(function (e) { toast(e.message); });
  }
  function renderAdmin() {
    if (!admP.length) { $("alist").innerHTML = '<p class="empty">No providers.</p>'; return; }
    $("alist").innerHTML = admP.map(function (p) {
      return '<article class="card"><div class="bk"><div><h3>' + esc(p.name) + '</h3><div class="meta">' + esc(p.cat) + " · " + esc(p.area || "") +
        " · login: " + esc(p.email || "none") + "</div><div>" + esc(p.svc) + '</div><div class="meta">' + inr(p.price) + " / " + esc(p.unit || "") +
        " · ★ " + p.rating.toFixed(1) + '</div></div><div><button class="btn" data-e="' + p._id + '">Edit</button> ' +
        '<button class="btn ghost" data-del="' + p._id + '">Delete</button></div></div></article>';
    }).join("");
  }
  function openProvForm(id) {
    editId = id || null;
    var p = admP.filter(function (x) { return x._id === id; })[0];
    $("pc").innerHTML = CATS.slice(1).map(function (c) { return "<option>" + c + "</option>"; }).join("");
    $("pt").textContent = p ? "Edit provider" : "Add provider";
    $("pn").value = p ? p.name : "";
    $("pc").value = p ? p.cat : CATS[1];
    $("ps").value = p ? p.svc : "";
    $("pp").value = p ? p.price : "";
    $("pu").value = p ? p.unit : "visit";
    $("pa").value = p ? p.area || "" : "";
    $("pe").value = "";
    $("pw").value = "";
    $("pnew").hidden = !!p;
    $("perr").textContent = "";
    $("pdlg").showModal();
  }

  // ---------- reviews ----------
  var rateId = null;
  function openRate(id) {
    rateId = id;
    var b = bookings.filter(function (x) { return x._id === id; })[0];
    $("rts").textContent = b ? b.providerName + " · " + b.svc : "";
    $("rterr").textContent = "";
    $("rtv").value = "5";
    $("rtt").value = "";
    $("rtdlg").showModal();
  }
  function openReviews(id) {
    var p = providers.filter(function (x) { return x._id === id; })[0];
    $("rvt").textContent = p ? "Reviews for " + p.name : "Reviews";
    $("rvl").innerHTML = '<p class="meta">Loading…</p>';
    $("rvdlg").showModal();
    api("/api/providers/" + id + "/reviews").then(function (rows) {
      $("rvl").innerHTML = rows.length ? rows.map(function (r) {
        return '<div class="card" style="padding:12px"><div><strong>★ ' + r.rating + "</strong> · " + esc(r.name) + "</div>" +
          (r.review ? "<div>" + esc(r.review) + "</div>" : "") + "</div>";
      }).join("") : '<p class="meta">No reviews yet.</p>';
    }).catch(function (e) { $("rvl").textContent = e.message; });
  }

  // ---------- events ----------
  $("chips").addEventListener("click", function (e) {
    var c = e.target.closest("[data-c]");
    if (!c) return;
    state.cat = c.dataset.c;
    renderChips();
    renderGrid();
  });
  $("grid").addEventListener("click", function (e) {
    var r = e.target.closest("[data-r]");
    if (r) { openReviews(r.dataset.r); return; }
    var b = e.target.closest("[data-b]");
    if (b) openBook(b.dataset.b);
  });
  $("list").addEventListener("click", function (e) {
    var tb = e.target.closest("[data-t]");
    if (tb) { openRate(tb.dataset.t); return; }
    var pb = e.target.closest("[data-p]");
    if (pb) { pay(pb.dataset.p); return; }
    var x = e.target.closest("[data-x]");
    if (!x) return;
    api("/api/bookings/" + x.dataset.x + "/cancel", "PATCH").then(function () {
      toast("Booking cancelled");
      return loadBookings();
    }).catch(function (err) { toast(err.message); });
  });
  $("dlist").addEventListener("click", function (e) {
    var d = e.target.closest("[data-d]");
    if (!d) return;
    api("/api/provider/bookings/" + d.dataset.d + "/complete", "PATCH").then(function () {
      toast("Marked as completed");
      return loadDash();
    }).catch(function (err) { toast(err.message); });
  });
  $("q").addEventListener("input", function (e) { state.q = e.target.value; renderGrid(); });
  $("sort").addEventListener("change", function (e) { state.sort = e.target.value; renderGrid(); });
  $("nBrowse").onclick = function () { show("browse"); };
  $("nBook").onclick = function () { show("mine"); loadBookings(); };
  $("nDash").onclick = function () { show("dash"); loadDash(); };
  $("nAdm").onclick = function () { show("adm"); loadAdmin(); };
  $("dfilter").addEventListener("click", function (e) {
    var f = e.target.closest("[data-f]");
    if (!f) return;
    dashFilter = f.dataset.f;
    renderDash();
  });
  // Providers: check for new bookings every 15 seconds while the tab is open
  setInterval(function () {
    if (user && user.role === "provider" && !document.hidden) loadDash();
  }, 15000);
  $("addP").onclick = function () { openProvForm(); };
  $("pcx").onclick = function () { $("pdlg").close(); };
  $("alist").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-e]");
    if (ed) { openProvForm(ed.dataset.e); return; }
    var del = e.target.closest("[data-del]");
    if (!del || !confirm("Delete this provider and its login?")) return;
    api("/api/admin/providers/" + del.dataset.del, "DELETE").then(function () {
      toast("Provider deleted");
      return Promise.all([loadAdmin(), api("/api/providers").then(function (rows) { providers = rows; renderGrid(); })]);
    }).catch(function (err) { toast(err.message); });
  });
  $("pf").addEventListener("submit", function (e) {
    e.preventDefault();
    var body = {
      name: $("pn").value.trim(), cat: $("pc").value, svc: $("ps").value.trim(),
      price: Number($("pp").value), unit: $("pu").value.trim(), area: $("pa").value.trim(),
    };
    var adding = !editId;
    var req;
    if (adding) {
      body.email = $("pe").value.trim();
      body.password = $("pw").value;
      req = api("/api/admin/providers", "POST", body);
    } else {
      req = api("/api/admin/providers/" + editId, "PATCH", body);
    }
    $("pb").disabled = true;
    req.then(function () {
      $("pdlg").close();
      toast(adding ? "Provider added" : "Provider updated");
      return Promise.all([loadAdmin(), api("/api/providers").then(function (rows) { providers = rows; renderGrid(); })]);
    }).catch(function (err) { $("perr").textContent = err.message; })
      .then(function () { $("pb").disabled = false; });
  });
  $("nAuth").onclick = function () { if (user) logout(); else openAuth("login"); };
  $("atg").onclick = function () { setMode(mode === "login" ? "signup" : "login"); };
  $("acx").onclick = function () { $("adlg").close(); };
  $("af").addEventListener("submit", function (e) {
    e.preventDefault();
    var body = { email: $("ae").value.trim(), password: $("apw").value };
    if (mode === "signup") {
      body.name = $("an").value.trim();
      body.phone = $("ap").value.replace(/\s/g, "");
    }
    $("ab").disabled = true;
    api("/api/auth/" + mode, "POST", body).then(function (r) {
      saveToken(r.token);
      $("adlg").close();
      $("af").reset();
      setUser(r.user);
      toast("Welcome, " + r.user.name);
    }).catch(function (err) {
      $("aerr").textContent = err.message;
    }).then(function () { $("ab").disabled = false; });
  });
  $("dm").addEventListener("change", setDemoMethod);
  $("dcx").onclick = function () { $("ddlg").close(); toast("Payment pending. You can pay later from My bookings."); };
  $("df").addEventListener("submit", function (e) {
    e.preventDefault();
    var m = $("dm").value;
    var err = "";
    if (m === "upi" && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test($("duid").value.trim())) err = "Enter a valid UPI ID, for example name@upi";
    if (m === "card") {
      if (!/^\d{16}$/.test($("dcn").value.replace(/\s/g, ""))) err = "Enter a 16-digit card number.";
      else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test($("dce").value.trim())) err = "Enter the expiry as MM/YY.";
      else if (!/^\d{3}$/.test($("dcv").value.trim())) err = "Enter the 3-digit CVV.";
    }
    if (err) { $("derr").textContent = err; return; }
    $("derr").textContent = "";
    $("dpb").disabled = true;
    $("dpb").textContent = "Processing…";
    setTimeout(function () {
      api("/api/payments/demo-pay", "POST", { bookingId: demoId, method: m }).then(function () {
        $("ddlg").close();
        $("df").reset();
        toast("Payment successful (demo)");
        return loadBookings();
      }).catch(function (e2) { $("derr").textContent = e2.message; })
        .then(function () { $("dpb").disabled = false; $("dpb").textContent = demoLabel; });
    }, 1200);
  });
  $("rtx").onclick = function () { $("rtdlg").close(); };
  $("rvx").onclick = function () { $("rvdlg").close(); };
  $("rtf").addEventListener("submit", function (e) {
    e.preventDefault();
    $("rtb").disabled = true;
    api("/api/bookings/" + rateId + "/review", "PATCH", { rating: Number($("rtv").value), review: $("rtt").value.trim() })
      .then(function () {
        $("rtdlg").close();
        toast("Thanks for your review!");
        loadBookings();
        return api("/api/providers").then(function (rows) { providers = rows; renderGrid(); });
      })
      .catch(function (err) { $("rterr").textContent = err.message; })
      .then(function () { $("rtb").disabled = false; });
  });
  $("fd").addEventListener("change", refreshTimes);
  $("cx").onclick = function () { $("dlg").close(); };
  $("f").addEventListener("submit", submitBooking);

  // ---------- start ----------
  api("/api/config").then(function (c) { cfg = c; }).catch(function () {});
  renderChips();
  api("/api/providers").then(function (rows) {
    providers = rows;
    renderGrid();
  }).catch(function () {
    $("grid").innerHTML = '<p class="empty">Could not load providers. Check that the server and MongoDB are running.</p>';
  });
  if (token) {
    api("/api/auth/me").then(function (r) { setUser(r.user); }).catch(function () { saveToken(""); setUser(null); });
  } else {
    setUser(null);
  }
})();

(function(){
  var w=document.getElementById("welcome"),b=document.getElementById("wgo");
  if(!w)return;
  var seen=false;
  try{seen=sessionStorage.getItem("lf-welcome")==="1";}catch(e){}
  function close(){
    w.classList.add("hide");
    try{sessionStorage.setItem("lf-welcome","1");}catch(e){}
    setTimeout(function(){w.style.display="none";},450);
  }
  if(seen){w.style.display="none";return;}
  b.addEventListener("click",close);
  setTimeout(close,3500);
})();
