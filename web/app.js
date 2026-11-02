(() => {
  const config = window.BOOKNOOK_CONFIG || {};
  const apiUrl = (config.apiUrl || "").replace(/\/+$/, "");
  const demoMode = !apiUrl;
  const sampleBooks = [
    { bookId: "demo-1", title: "The Secret History", author: "Donna Tartt", condition: "Very good", category: "Fiction", priceCents: 1250, sellerId: "reader-1", status: "LISTED", createdAt: "2025-03-08", description: "A campus classic, ready for another read." },
    { bookId: "demo-2", title: "Braiding Sweetgrass", author: "Robin Wall Kimmerer", condition: "Good", category: "Nature", priceCents: 1480, sellerId: "reader-2", status: "LISTED", createdAt: "2025-03-07", description: "Beautifully read and lovingly kept." },
    { bookId: "demo-3", title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", condition: "Like new", category: "Fiction", priceCents: 1100, sellerId: "reader-3", status: "LISTED", createdAt: "2025-03-06", description: "A favorite that deserves a new shelf." },
    { bookId: "demo-4", title: "Crying in H Mart", author: "Michelle Zauner", condition: "Very good", category: "Memoir", priceCents: 925, sellerId: "reader-4", status: "LISTED", createdAt: "2025-03-05", description: "One of those books you pass along." },
    { bookId: "demo-5", title: "The Creative Act", author: "Rick Rubin", condition: "Good", category: "Arts", priceCents: 1750, sellerId: "reader-5", status: "LISTED", createdAt: "2025-03-04", description: "A thoughtful companion for making things." },
    { bookId: "demo-6", title: "Pachinko", author: "Min Jin Lee", condition: "Acceptable", category: "Fiction", priceCents: 800, sellerId: "reader-6", status: "LISTED", createdAt: "2025-03-03", description: "A few notes in the margins; all the better for it." },
    { bookId: "demo-7", title: "A Psalm for the Wild-Built", author: "Becky Chambers", condition: "Like new", category: "Sci-fi", priceCents: 1050, sellerId: "reader-7", status: "LISTED", createdAt: "2025-03-02", description: "A little hope for a quiet afternoon." },
    { bookId: "demo-8", title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", condition: "Good", category: "Sci-fi", priceCents: 990, sellerId: "reader-8", status: "LISTED", createdAt: "2025-03-01", description: "A well-loved edition of a timeless story." },
  ];
  const demoKey = "booknook-demo-state-v1";
  const sessionKey = "booknook-session";
  const state = {
    books: [],
    orders: [],
    listings: [],
    category: "All books",
    search: "",
    member: readMember(),
    authMode: "signin",
  };
  const elements = {
    grid: document.querySelector("#book-grid"),
    categories: document.querySelector("#categories"),
    empty: document.querySelector("#empty-state"),
    modal: document.querySelector("#modal"),
    modalContent: document.querySelector("#modal-content"),
    toast: document.querySelector("#toast"),
    account: document.querySelector("#account-button"),
  };

  function readMember() {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey));
    } catch {
      return null;
    }
  }

  function getDemoState() {
    try {
      const saved = JSON.parse(localStorage.getItem(demoKey));
      if (saved && Array.isArray(saved.books) && Array.isArray(saved.orders)) return saved;
    } catch {
      showToast("Saved demo data could not be read; starting with sample books.");
    }
    return { books: sampleBooks, orders: [] };
  }

  function saveDemoState() {
    localStorage.setItem(demoKey, JSON.stringify({ books: state.books, orders: state.orders }));
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 2800);
  }

  async function request(path, options = {}) {
    const token = state.member?.idToken;
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const payload = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(payload.message || "The request could not be completed.");
    return payload;
  }

  async function loadBooks() {
    if (demoMode) {
      state.books = getDemoState().books;
      render();
      return;
    }
    if (!state.member?.idToken) {
      state.books = [];
      render();
      return;
    }
    try {
      state.books = (await request("/books")).books;
    } catch (error) {
      state.books = [];
      showToast(error.message);
    }
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function formatPrice(cents) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function categoriesFor(books) {
    return ["All books", ...new Set(books.map((book) => book.category || "Other"))];
  }

  function renderCategories() {
    const categories = categoriesFor(state.books);
    if (!categories.includes(state.category)) state.category = "All books";
    elements.categories.innerHTML = categories.map((category) => `
      <button class="category-chip ${category === state.category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
    `).join("");
  }

  function render() {
    elements.account.textContent = state.member ? "Sign out" : "Sign in";
    renderCategories();
    const books = state.books.filter((book) => {
      const query = state.search.toLowerCase();
      const matchesSearch = !query || `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(query);
      return matchesSearch && (state.category === "All books" || (book.category || "Other") === state.category);
    });
    document.querySelector("#section-title").textContent = state.search ? `Results for “${escapeHtml(state.search)}”` : state.category === "All books" ? "Fresh off the shelf" : state.category;
    elements.empty.classList.toggle("hidden", books.length > 0);
    elements.grid.classList.toggle("hidden", books.length === 0);
    elements.grid.innerHTML = books.map((book, index) => {
      const ownBook = state.member && book.sellerId === state.member.sub;
      const cover = index % 6;
      return `
        <article class="book-card">
          <div class="cover-wrap">
            <span class="condition-pill">${escapeHtml(book.condition)}</span>
            <button class="heart-button" type="button" aria-label="Save ${escapeHtml(book.title)}" data-action="save" data-id="${escapeHtml(book.bookId)}">♡</button>
            <div class="book-cover cover-${cover}">
              <span class="cover-decoration"></span>
              <span class="cover-title">${escapeHtml(book.title)}</span>
              <span class="cover-author">${escapeHtml(book.author)}</span>
            </div>
          </div>
          <div class="card-info">
            <div class="card-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</div>
            <div class="card-author">by ${escapeHtml(book.author)}</div>
            <div class="card-bottom"><span class="price">${formatPrice(book.priceCents)}</span>
              ${ownBook ? '<span class="seller-label">Your listing</span>' : `<button class="buy-button" type="button" data-action="buy" data-id="${escapeHtml(book.bookId)}">Make it yours</button>`}
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function openModal(content) {
    elements.modalContent.innerHTML = content;
    elements.modal.showModal();
  }

  function closeModal() {
    elements.modal.close();
    elements.modalContent.innerHTML = "";
  }

  function requireMember(action) {
    if (state.member) return true;
    openAuth("signin");
    showToast(`Sign in to ${action}.`);
    return false;
  }

  function openAuth(mode = "signin", message = "") {
    state.authMode = mode;
    openModal(`
      <div class="eyebrow">YOUR BOOKNOOK ACCOUNT</div>
      <h2>${mode === "signup" ? "Join the nook." : "Welcome back."}</h2>
      <p class="modal-intro">${demoMode ? "Try the demo, or sign in to keep your reading life together." : "Sign in or create an account to buy and sell books."}</p>
      <form class="modal-form" id="auth-form">
        <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" /></div>
        <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="${demoMode ? 1 : 12}" required /></div>
        <div class="form-message" id="auth-message">${escapeHtml(message)}</div>
        <button class="button button-dark" type="submit">${mode === "signup" ? "Create account" : "Sign in"}</button>
        ${demoMode ? '<button class="button button-light" id="demo-login" type="button">Continue as demo reader</button>' : ""}
        <div class="form-hint">${mode === "signup" ? "Already a member? " : "New to BookNook? "}<button type="button" data-auth-toggle>${mode === "signup" ? "Sign in" : "Create an account"}</button></div>
      </form>
    `);
  }

  function cognitoEndpoint() {
    const region = config.userPoolId?.split("_")[0];
    if (!region || !config.userPoolClientId) throw new Error("Add the Cognito pool ID and app client ID to web/config.js first.");
    return `https://cognito-idp.${region}.amazonaws.com/`;
  }

  async function cognito(action, parameters) {
    const response = await fetch(cognitoEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify({ ClientId: config.userPoolClientId, ...parameters }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Authentication failed.");
    return result;
  }

  function decodeMember(idToken) {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(decodeURIComponent(escape(atob(payload))));
    return { idToken, sub: claims.sub, email: claims.email };
  }

  async function submitAuth(form) {
    const data = new FormData(form);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    const message = document.querySelector("#auth-message");
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (demoMode) {
        state.member = { sub: `demo-${email.toLowerCase()}`, email, demo: true };
        sessionStorage.setItem(sessionKey, JSON.stringify(state.member));
        closeModal();
        render();
        showToast("You’re in. Welcome to the nook!");
        return;
      }
      if (state.authMode === "signup") {
        await cognito("SignUp", {
          Username: email,
          Password: password,
          UserAttributes: [{ Name: "email", Value: email }],
        });
        openConfirm(email);
        return;
      }
      const result = await cognito("InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: email, PASSWORD: password },
      });
      if (!result.AuthenticationResult?.IdToken) throw new Error("Complete the additional sign-in challenge before continuing.");
      state.member = decodeMember(result.AuthenticationResult.IdToken);
      sessionStorage.setItem(sessionKey, JSON.stringify(state.member));
      closeModal();
      await loadBooks();
      showToast("Welcome back to BookNook.");
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
    }
  }

  function openConfirm(email) {
    openModal(`
      <div class="eyebrow">ONE LAST STEP</div><h2>Check your inbox.</h2>
      <p class="modal-intro">Enter the verification code sent to ${escapeHtml(email)}.</p>
      <form class="modal-form" id="confirm-form">
        <div class="field"><label for="confirm-code">Verification code</label><input id="confirm-code" name="code" inputmode="numeric" autocomplete="one-time-code" required /></div>
        <div class="form-message" id="confirm-message"></div>
        <button class="button button-dark" type="submit">Verify email</button>
      </form>
    `);
    document.querySelector("#confirm-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = new FormData(event.currentTarget).get("code");
      try {
        await cognito("ConfirmSignUp", { Username: email, ConfirmationCode: code });
        openAuth("signin", "Email verified. Sign in to continue.");
      } catch (error) {
        document.querySelector("#confirm-message").textContent = error.message;
      }
    });
  }

  function openSellForm() {
    if (!requireMember("list a book")) return;
    openModal(`
      <div class="eyebrow">PASS A STORY ALONG</div><h2>List a book.</h2>
      <p class="modal-intro">Give another reader the chance to love it next.</p>
      <form class="modal-form" id="sell-form">
        <div class="field"><label for="book-title">Book title</label><input id="book-title" name="title" maxlength="160" required /></div>
        <div class="field"><label for="book-author">Author</label><input id="book-author" name="author" maxlength="120" required /></div>
        <div class="field-row">
          <div class="field"><label for="book-condition">Condition</label><select id="book-condition" name="condition"><option>Like new</option><option>Very good</option><option>Good</option><option>Acceptable</option></select></div>
          <div class="field"><label for="book-price">Price (USD)</label><input id="book-price" name="price" type="number" min="0.01" max="100000" step="0.01" required /></div>
        </div>
        <div class="field"><label for="book-category">Category</label><select id="book-category" name="category"><option>Fiction</option><option>Memoir</option><option>Nature</option><option>Arts</option><option>Sci-fi</option><option>Nonfiction</option><option>Other</option></select></div>
        <div class="field"><label for="book-description">A note for the next reader (optional)</label><textarea id="book-description" name="description" maxlength="2000"></textarea></div>
        <div class="form-message" id="sell-message"></div>
        <button class="button button-dark" type="submit">Put it on the shelf</button>
      </form>
    `);
    document.querySelector("#sell-form").addEventListener("submit", submitListing);
  }

  async function submitListing(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const price = Number(data.get("price"));
    if (!Number.isFinite(price) || price <= 0 || price > 100000) {
      document.querySelector("#sell-message").textContent = "Enter a price between $0.01 and $100,000.";
      return;
    }
    const listing = {
      title: String(data.get("title")).trim(),
      author: String(data.get("author")).trim(),
      condition: data.get("condition"),
      category: data.get("category"),
      description: String(data.get("description") || "").trim(),
      priceCents: Math.round(price * 100),
    };
    try {
      if (demoMode) {
        listing.bookId = `demo-${crypto.randomUUID()}`;
        listing.sellerId = state.member.sub;
        listing.status = "LISTED";
        listing.createdAt = new Date().toISOString();
        state.books.unshift(listing);
        saveDemoState();
      } else {
        const result = await request("/books", { method: "POST", body: JSON.stringify(listing) });
        state.books.unshift(result.book);
      }
      closeModal();
      render();
      showToast("Your book is on the shelf. Nice one!");
    } catch (error) {
      document.querySelector("#sell-message").textContent = error.message;
    }
  }

  async function buyBook(bookId) {
    if (!requireMember("buy a book")) return;
    const book = state.books.find((item) => item.bookId === bookId);
    if (!book) return;
    if (book.sellerId === state.member.sub) {
      showToast("You can’t buy your own listing.");
      return;
    }
    openModal(`
      <div class="eyebrow">ONE MORE CHAPTER</div><h2>Make it yours?</h2>
      <p class="modal-intro">You’re placing a demo order for <strong>${escapeHtml(book.title)}</strong> by ${escapeHtml(book.author)} at ${formatPrice(book.priceCents)}.</p>
      <p class="form-hint">${demoMode ? "Demo orders do not process payments or arrange delivery." : "This prototype records an order but does not process a payment or arrange delivery."}</p>
      <div class="modal-form"><div class="form-message" id="buy-message"></div><button class="button button-dark" id="confirm-buy" type="button">Place demo order</button></div>
    `);
    document.querySelector("#confirm-buy").addEventListener("click", async () => {
      const button = document.querySelector("#confirm-buy");
      button.disabled = true;
      try {
        if (demoMode) {
          state.books = state.books.filter((item) => item.bookId !== bookId);
          state.orders.unshift({
            orderId: `demo-order-${crypto.randomUUID()}`,
            bookId,
            title: book.title,
            priceCents: book.priceCents,
            status: "PLACED",
            createdAt: new Date().toISOString(),
          });
          saveDemoState();
        } else {
          const result = await request(`/books/${encodeURIComponent(bookId)}/checkout`, { method: "POST", body: "{}" });
          state.orders.unshift({ ...result.order, title: book.title, priceCents: book.priceCents });
          state.books = state.books.filter((item) => item.bookId !== bookId);
        }
        closeModal();
        render();
        showToast("Order placed. The story is yours!");
      } catch (error) {
        document.querySelector("#buy-message").textContent = error.message;
        button.disabled = false;
      }
    });
  }

  async function openPersonalList(kind) {
    if (!requireMember("view your account")) return;
    let rows = [];
    try {
      if (demoMode) {
        const saved = getDemoState();
        rows = kind === "orders" ? saved.orders : saved.books.filter((book) => book.sellerId === state.member.sub);
      } else {
        const path = kind === "orders" ? "/me/orders" : "/me/listings";
        const result = await request(path);
        rows = kind === "orders" ? result.orders : result.books;
      }
    } catch (error) {
      showToast(error.message);
      return;
    }
    const title = kind === "orders" ? "Your orders." : "Your listings.";
    const content = kind === "orders" ? "No orders yet. Your next favorite is out there." : "No books listed yet. Make room on your shelf.";
    openModal(`
      <div class="eyebrow">YOUR BOOKNOOK</div><h2>${title}</h2>
      <p class="modal-intro">${escapeHtml(state.member.email || "Your reader account")}</p>
      ${rows.length ? rows.map((row) => `
        <div class="list-row"><div><strong>${escapeHtml(row.title || `Order ${row.orderId}`)}</strong><small>${kind === "orders" ? `Placed ${new Date(row.createdAt).toLocaleDateString()}` : `${formatPrice(row.priceCents)} · ${escapeHtml(row.condition)}`}</small></div><span class="status-tag">${escapeHtml(row.status || "LISTED")}</span></div>
      `).join("") : `<p class="form-hint">${content}</p>`}
    `);
  }

  elements.grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "buy") buyBook(button.dataset.id);
    if (button.dataset.action === "save") {
      button.classList.toggle("saved");
      button.textContent = button.classList.contains("saved") ? "♥" : "♡";
      showToast(button.classList.contains("saved") ? "Saved to your reading list." : "Removed from saved books.");
    }
  });
  elements.categories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    render();
  });
  document.querySelector("#search-form").addEventListener("submit", (event) => event.preventDefault());
  document.querySelector("#search").addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    render();
  });
  document.querySelector("#modal-close").addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });
  elements.modalContent.addEventListener("click", (event) => {
    if (event.target.closest("[data-auth-toggle]")) openAuth(state.authMode === "signup" ? "signin" : "signup");
    if (event.target.id === "demo-login") {
      const email = document.querySelector("#auth-email").value.trim() || "reader@booknook.test";
      state.member = { sub: `demo-${email.toLowerCase()}`, email, demo: true };
      sessionStorage.setItem(sessionKey, JSON.stringify(state.member));
      closeModal();
      render();
      showToast("You’re in. Welcome to the nook!");
    }
  });
  elements.modalContent.addEventListener("submit", (event) => {
    if (event.target.id === "auth-form") {
      event.preventDefault();
      submitAuth(event.target);
    }
  });
  document.querySelector("#account-button").addEventListener("click", async () => {
    if (!state.member) {
      openAuth("signin");
      return;
    }
    state.member = null;
    sessionStorage.removeItem(sessionKey);
    if (!demoMode) await loadBooks();
    render();
    showToast("Signed out. See you next time.");
  });
  document.querySelector("#hero-sell-button").addEventListener("click", openSellForm);
  document.querySelector("#banner-sell-button").addEventListener("click", openSellForm);
  document.querySelector("#empty-sell-button").addEventListener("click", openSellForm);
  document.querySelector("#listings-button").addEventListener("click", () => openPersonalList("listings"));
  document.querySelector("#orders-button").addEventListener("click", () => openPersonalList("orders"));
  document.querySelector("#view-all-button").addEventListener("click", () => {
    state.category = "All books";
    state.search = "";
    document.querySelector("#search").value = "";
    render();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.querySelector("#search").focus();
    }
  });

  if (!demoMode && state.member?.demo) {
    state.member = null;
    sessionStorage.removeItem(sessionKey);
  }
  if (!demoMode && !config.userPoolId) {
    showToast("Add your Cognito settings to web/config.js to connect the AWS API.");
  }
  loadBooks();
})();
