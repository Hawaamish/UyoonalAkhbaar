// Extracted from U2Qasaid.html. Existing section comments describe the page's behavior.

const csvPath = "../assets/data/U2 Qasaid_Behr_extracted.csv";

		const keys = {
			pageA: "صـ",
			pageB: "سـ",
			matla: "المطلع",
			poet: "اسم الشاعر",
			reason: "سبب التصنيف",
			verses: "عدد الاَبيات",
			bahr: "البحر",
			rawi: "الروي",
			images: "images"
		};

		const state = {
			rows: [],
			filtered: [],
			searchMatchedRows: [],
			pageNumbers: [],
			selectedBookPage: null,
			searchVisible: false,
			selectedMatlaId: null
		};

		const els = {
			searchMatla: document.getElementById("searchMatla"),
			searchReason: document.getElementById("searchReason"),
			pageExact: document.getElementById("pageExact"),
			poetSearch: document.getElementById("poetSearch"),
			bahrSelect: document.getElementById("bahrSelect"),
			applyFilters: document.getElementById("applyFilters"),
			clearFilters: document.getElementById("clearFilters"),
			toggleSearch: document.getElementById("toggleSearch"),
			closeSearch: document.getElementById("closeSearch"),
			filtersPanel: document.querySelector(".filters"),
			searchOverlay: document.getElementById("searchOverlay"),
			matlaList: document.getElementById("matlaList"),
			matlaListMobile: document.getElementById("matlaListMobile"),
			matlaDetails: document.getElementById("matlaDetails"),
			mobileSideToggle: document.getElementById("mobileSideToggle"),
			mobileSideBtn: document.getElementById("mobileSideBtn"),
			mobileMatlaBtn: document.getElementById("mobileMatlaBtn"),
			mobileSearchBtn: document.getElementById("mobileSearchBtn"),
			mobileMatlaOverlay: document.getElementById("mobileMatlaOverlay"),
			closeMobileMatla: document.getElementById("closeMobileMatla"),
			pageStrip: document.getElementById("pageStrip"),
			cards: document.getElementById("cards"),
			shownCount: document.getElementById("shownCount"),
			pageInfo: document.getElementById("pageInfo"),
			prevPage: document.getElementById("prevPage"),
			nextPage: document.getElementById("nextPage"),
			pagerText: document.getElementById("pagerText"),
			loadError: document.getElementById("loadError")
		};

		const normalize = (value) => String(value || "").trim();
		const normalizeForSearch = (value) =>
			normalize(value)
				.toLowerCase()
				.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
				.replace(/\u0640/g, "");

		const toInt = (value) => {
			const n = parseInt(String(value || "").trim(), 10);
			return Number.isNaN(n) ? null : n;
		};

		function setError(message) {
			els.loadError.style.display = "block";
			els.loadError.textContent = message;
		}

		function clearError() {
			els.loadError.style.display = "none";
			els.loadError.textContent = "";
		}

		function extractPageNumbers(rows) {
			const nums = new Set();
			rows.forEach((row) => {
				const a = toInt(row[keys.pageA]);
				if (a !== null) nums.add(a);
			});
			return [...nums].sort((x, y) => x - y);
		}

		function parseCsvText(text) {
			const parsed = Papa.parse(text, {
				header: true,
				skipEmptyLines: true
			});

			if (parsed.errors && parsed.errors.length) {
				console.warn("CSV parse warnings", parsed.errors);
			}

			state.rows = (parsed.data || []).map((row, idx) => {
				const clean = {};
				Object.keys(row || {}).forEach((k) => {
					clean[normalize(k)] = normalize(row[k]);
				});
				clean.__id = idx + 1;
				return clean;
			});

			state.pageNumbers = extractPageNumbers(state.rows);
			if (state.pageNumbers.length) {
				state.selectedBookPage = state.pageNumbers[0];
			}

			buildBahrOptions();
			buildPoetOptions();
			renderMatlaList();
			applyFilters();
		}

		function renderMatlaList() {
			const html = state.rows
				.map((row) => {
					const id = row.__id;
					const matlaText = normalize(row[keys.matla]) || "-";
					const isActive = id === state.selectedMatlaId;
					return `<button class="matla-item ${isActive ? "active" : ""}" type="button" data-id="${id}" title="${escapeHtml(matlaText)}">${escapeHtml(matlaText)}</button>`;
				})
				.join("");

			if (els.matlaList) els.matlaList.innerHTML = html;
			if (els.matlaListMobile) els.matlaListMobile.innerHTML = html;
		}

		async function loadCsvFile() {
			clearError();
			try {
				const response = await fetch(csvPath, { cache: "no-store" });
				if (!response.ok) throw new Error("تعذر تحميل CSV");
				const text = await response.text();
				parseCsvText(text);
			} catch (err) {
				setError("تعذر تحميل الملف CSV تلقائيًا. تأكد أن الملف موجود بجانب الصفحة بنفس الاسم.");
			}
		}

		function buildBahrOptions() {
			const values = [...new Set(state.rows.map((r) => normalize(r[keys.bahr])).filter(Boolean))];
			values.sort((a, b) => a.localeCompare(b, "ar"));

			const firstOption = '<option value="">كل البحور</option>';
			els.bahrSelect.innerHTML = firstOption + values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
		}

		function buildPoetOptions() {
			const values = [...new Set(state.rows.map((r) => normalize(r[keys.poet])).filter(Boolean))];
			values.sort((a, b) => a.localeCompare(b, "ar"));

			const firstOption = '<option value="">كل الشعراء</option>';
			els.poetSearch.innerHTML = firstOption + values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
		}

		function escapeHtml(value) {
			return String(value)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/\"/g, "&quot;")
				.replace(/'/g, "&#39;");
		}

		function sanitizeRichText(value) {
			const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "META", "LINK", "BASE"]);
			const template = document.createElement("template");
			template.innerHTML = String(value || "");

			const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
			const toUnwrap = [];
			while (walker.nextNode()) {
				const el = walker.currentNode;
				if (blockedTags.has(el.tagName)) {
					toUnwrap.push(el);
					continue;
				}
				[...el.attributes].forEach((attr) => {
					const name = attr.name.toLowerCase();
					const val = String(attr.value || "").toLowerCase().trim();
					if (name.startsWith("on")) {
						el.removeAttribute(attr.name);
						return;
					}
					if ((name === "href" || name === "src") && val.startsWith("javascript:")) {
						el.removeAttribute(attr.name);
					}
				});
			}

			toUnwrap.forEach((el) => {
				const parent = el.parentNode;
				if (!parent) return;
				while (el.firstChild) {
					parent.insertBefore(el.firstChild, el);
				}
				parent.removeChild(el);
			});

			return template.innerHTML;
		}

		function rowPassesFilters(row) {
			const matlaQuery = normalizeForSearch(els.searchMatla.value);
			const reasonQuery = normalizeForSearch(els.searchReason.value);
			const poetQuery = normalizeForSearch(els.poetSearch.value);
			const selectedBahr = normalizeForSearch(els.bahrSelect.value);
			const pageExact = toInt(els.pageExact.value);

			const pageA = toInt(row[keys.pageA]);

			const matla = normalizeForSearch(row[keys.matla]);
			const reason = normalizeForSearch(row[keys.reason]);
			const bahr = normalizeForSearch(row[keys.bahr]);
			const poet = normalizeForSearch(row[keys.poet]);

			if (matlaQuery && !matla.includes(matlaQuery)) return false;
			if (reasonQuery && !reason.includes(reasonQuery)) return false;
			if (poetQuery && poet !== poetQuery) return false;
			if (selectedBahr && bahr !== selectedBahr) return false;

			if (pageExact !== null && pageA !== pageExact) return false;

			return true;
		}

		function hasActiveSearch() {
			return [
				els.searchMatla.value,
				els.searchReason.value,
				els.pageExact.value,
				els.poetSearch.value,
				els.bahrSelect.value
			].some((v) => normalize(v) !== "");
		}

		function clearSearchInputs() {
			els.searchMatla.value = "";
			els.searchReason.value = "";
			els.pageExact.value = "";
			els.poetSearch.value = "";
			els.bahrSelect.value = "";
		}

		function rowInSelectedBookPage(row) {
			if (state.selectedBookPage === null) return true;
			const pageA = toInt(row[keys.pageA]);
			return pageA === state.selectedBookPage;
		}

		function applyFilters() {
			state.searchMatchedRows = hasActiveSearch()
				? state.rows.filter((row) => rowPassesFilters(row))
				: [...state.rows];
			state.pageNumbers = extractPageNumbers(state.searchMatchedRows);

			if (!state.pageNumbers.length) {
				state.selectedBookPage = null;
				state.filtered = [];
				render();
				return;
			}

			if (!state.pageNumbers.includes(state.selectedBookPage)) {
				state.selectedBookPage = state.pageNumbers[0];
			}

			state.filtered = state.searchMatchedRows.filter((row) => rowInSelectedBookPage(row));
			renderMatlaList();
			render();
		}

		function renderPageStrip() {
			if (!state.pageNumbers.length) {
				els.pageStrip.innerHTML = "";
				return;
			}

			els.pageStrip.innerHTML = state.pageNumbers
				.map((n) => `<button class="page-chip ${n === state.selectedBookPage ? "active" : ""}" data-page="${n}">${n}</button>`)
				.join("");
		}

		function scrollSelectedPageChipIntoView() {
			const activeChip = els.pageStrip.querySelector(".page-chip.active");
			if (!activeChip) return;
			activeChip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
		}

		function render() {
			renderPageStrip();
			const total = state.filtered.length;
			const pageRows = state.filtered;

			const currentIndex = state.pageNumbers.findIndex((n) => n === state.selectedBookPage);
			const safeIndex = currentIndex >= 0 ? currentIndex : 0;
			const totalBookPages = state.pageNumbers.length;

			els.shownCount.textContent = `النتائج في الصفحة: ${total}`;
			els.pageInfo.textContent = `الصفحة المختارة: ${state.selectedBookPage ?? "-"}`;
			els.pagerText.textContent = totalBookPages ? `${safeIndex + 1} / ${totalBookPages}` : "-";
			els.prevPage.disabled = !totalBookPages || safeIndex <= 0;
			els.nextPage.disabled = !totalBookPages || safeIndex >= totalBookPages - 1;

			if (!pageRows.length) {
				els.cards.innerHTML = '<div class="empty">لا توجد نتائج مطابقة للفلاتر الحالية.</div>';
				return;
			}

			els.cards.innerHTML = pageRows.map((row, i) => renderCard(row, i)).join("");
		}

		function renderCard(row, index) {
			const pageA = normalize(row[keys.pageA]) || "-";
			const pageB = normalize(row[keys.pageB]) || "-";
			const matla = normalize(row[keys.matla]) || "—";
			const reason = normalize(row[keys.reason]) || "—";
			const poet = normalize(row[keys.poet]) || "غير مذكور";
			const bahr = normalize(row[keys.bahr]) || "غير محدد";
			const verses = normalize(row[keys.verses]) || "-";

			const hiddenKeys = new Set([keys.pageA, keys.pageB, keys.matla, keys.reason, keys.poet, keys.bahr, keys.verses]);
			const extra = Object.keys(row)
				.filter((k) => !hiddenKeys.has(k) && !k.startsWith("__") && normalize(row[k]))
				.map((k) => `<div class="meta-item"><span class="k">${escapeHtml(k)}</span><span class="v">${sanitizeRichText(row[k])}</span></div>`)
				.join("");

			const imgPath = `../Abyat/${pageA}${pageB}.png`;
			const imgPanel = `<div class="card-img-panel"><img class="card-img-thumb" src="${imgPath}" loading="lazy" alt="صورة البيت" onerror="this.style.visibility='hidden'" onclick="openImgLightbox(this.src)"></div>`;

			return `
				<div class="card-row" style="animation-delay:${index * 35}ms">
					<article class="card">
						<div class="card-head">
							<div style="display:flex; gap:6px; flex-wrap:wrap;">
								<span class="badge page">صـ: ${escapeHtml(pageA)} | سـ: ${escapeHtml(pageB)}</span>
								<span class="badge count">الأبيات: ${escapeHtml(verses)}</span>
							</div>
						</div>

						<div class="poet-box">
							<div class="poet-line">
								<span class="poet-label">اسم الشاعر:</span>
								<span class="poet-value">${sanitizeRichText(poet)}</span>
							</div>
						</div>

						<div class="matla-box">
							<p class="matla-title"></p>
							<p class="matla-text">${sanitizeRichText(matla)}</p>
						</div>

						<div class="reason-box">
							<p class="reason-title">سبب التصنيف</p>
							<p class="reason-text">${sanitizeRichText(reason)}</p>
						</div>

						<div class="metrics-row">
							<span class="badge bahr">البحر: ${escapeHtml(bahr)}</span>
							<span class="badge rawi">الروي: ${sanitizeRichText(normalize(row[keys.rawi]) || "-")}</span>
						</div>
					</article>
					${imgPanel}
				</div>
			`;
		}

		let modalOpenedViaHistory = false;

		function pushModalHistory() {
			if (!modalOpenedViaHistory) {
				modalOpenedViaHistory = true;
				history.pushState({ qasaidModal: true }, "");
			}
		}

		function popModalHistoryIfNeeded() {
			if (modalOpenedViaHistory) {
				modalOpenedViaHistory = false;
				history.back();
			}
		}

		function openSearchPanel() {
			state.searchVisible = true;
			els.filtersPanel.classList.remove("is-hidden");
			els.searchOverlay.classList.remove("is-hidden");
			document.body.style.overflow = "hidden";
			els.toggleSearch.classList.add("is-active");
			els.toggleSearch.setAttribute("aria-pressed", "true");
			pushModalHistory();
		}

		function toggleSearchPanel() {
			if (state.searchVisible) {
				closeSearchPanel();
			} else {
				openSearchPanel();
			}
		}

		function closeSearchPanel(fromPopstate) {
			if (!state.searchVisible) return;
			state.searchVisible = false;
			els.filtersPanel.classList.add("is-hidden");
			els.searchOverlay.classList.add("is-hidden");
			document.body.style.overflow = "";
			els.toggleSearch.classList.remove("is-active");
			els.toggleSearch.setAttribute("aria-pressed", "false");
			if (!fromPopstate) popModalHistoryIfNeeded();
		}

		function goToBookPage(step) {
			const idx = state.pageNumbers.findIndex((n) => n === state.selectedBookPage);
			if (idx < 0) return;
			const nextIdx = Math.min(Math.max(0, idx + step), state.pageNumbers.length - 1);
			state.selectedBookPage = state.pageNumbers[nextIdx];
			applyFilters();
			window.scrollTo({ top: 0, behavior: "smooth" });
		}

		function attachEvents() {
			els.applyFilters.addEventListener("click", () => {
				applyFilters();
				closeSearchPanel();
			});
			els.clearFilters.addEventListener("click", () => {
				clearSearchInputs();
				state.selectedMatlaId = null;
				applyFilters();
			});
			els.toggleSearch.addEventListener("click", toggleSearchPanel);
			els.closeSearch.addEventListener("click", closeSearchPanel);
			els.searchOverlay.addEventListener("click", closeSearchPanel);

			document.addEventListener("keydown", (e) => {
				if (e.key === "Escape" && state.searchVisible) {
					closeSearchPanel();
				}
				if (e.key === "Escape" && els.mobileMatlaOverlay && els.mobileMatlaOverlay.classList.contains("open")) {
					closeMobileMatlaPopup();
				}
			});

			[els.searchMatla, els.searchReason, els.pageExact, els.poetSearch].forEach((el) => {
				el.addEventListener("keydown", (e) => {
					if (e.key === "Enter") applyFilters();
				});
			});

			els.bahrSelect.addEventListener("change", applyFilters);

			els.pageStrip.addEventListener("click", (e) => {
				const btn = e.target.closest("button[data-page]");
				if (!btn) return;
				state.selectedBookPage = parseInt(btn.dataset.page, 10);
				applyFilters();
			});

			function handleMatlaSelect(id) {
				const row = state.rows.find((r) => r.__id === id);
				if (!row) return;

				state.selectedMatlaId = id;
				const targetPage = toInt(row[keys.pageA]);
				if (targetPage === null) return;

				// Matla selection behaves as a page jump, not as a restrictive search.
				clearSearchInputs();
				state.searchMatchedRows = [...state.rows];
				state.pageNumbers = extractPageNumbers(state.searchMatchedRows);
				state.selectedBookPage = targetPage;
				state.filtered = state.searchMatchedRows.filter((r) => rowInSelectedBookPage(r));
				renderMatlaList();
				render();
				scrollSelectedPageChipIntoView();
				window.scrollTo({ top: 0, behavior: "smooth" });
			}

			els.matlaList.addEventListener("click", (e) => {
				const btn = e.target.closest("button[data-id]");
				if (!btn) return;
				handleMatlaSelect(parseInt(btn.dataset.id, 10));
			});

			if (els.matlaListMobile) {
				els.matlaListMobile.addEventListener("click", (e) => {
					const btn = e.target.closest("button[data-id]");
					if (!btn) return;
					handleMatlaSelect(parseInt(btn.dataset.id, 10));
					closeMobileMatlaPopup();
				});
			}

			// Mobile right-side drawer
			if (els.mobileSideBtn) {
				els.mobileSideBtn.addEventListener("click", () => {
					const isOpen = els.mobileSideToggle.classList.toggle("open");
					els.mobileSideBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
				});
			}

			function closeMobileSidePanel() {
				if (!els.mobileSideToggle) return;
				els.mobileSideToggle.classList.remove("open");
				els.mobileSideBtn.setAttribute("aria-expanded", "false");
			}

			if (els.mobileMatlaBtn) {
				els.mobileMatlaBtn.addEventListener("click", () => {
					closeMobileSidePanel();
					openMobileMatlaPopup();
				});
			}

			if (els.mobileSearchBtn) {
				els.mobileSearchBtn.addEventListener("click", () => {
					closeMobileSidePanel();
					toggleSearchPanel();
				});
			}

			function openMobileMatlaPopup() {
				if (!els.mobileMatlaOverlay) return;
				els.mobileMatlaOverlay.classList.add("open");
				document.body.style.overflow = "hidden";
				pushModalHistory();
			}

			function closeMobileMatlaPopup(fromPopstate) {
				if (!els.mobileMatlaOverlay) return;
				if (!els.mobileMatlaOverlay.classList.contains("open")) return;
				els.mobileMatlaOverlay.classList.remove("open");
				if (!state.searchVisible) document.body.style.overflow = "";
				if (!fromPopstate) popModalHistoryIfNeeded();
			}

			if (els.closeMobileMatla) {
				els.closeMobileMatla.addEventListener("click", closeMobileMatlaPopup);
			}

			if (els.mobileMatlaOverlay) {
				els.mobileMatlaOverlay.addEventListener("click", (e) => {
					if (e.target === els.mobileMatlaOverlay) closeMobileMatlaPopup();
				});
			}

			document.addEventListener("click", (e) => {
				if (!els.mobileSideToggle || !els.mobileSideToggle.classList.contains("open")) return;
				if (!els.mobileSideToggle.contains(e.target)) closeMobileSidePanel();
			});

			// Make the mobile/back button close an open popup and return to the
			// main page instead of navigating away from the site.
			window.addEventListener("popstate", () => {
				modalOpenedViaHistory = false;
				if (state.searchVisible) closeSearchPanel(true);
				closeMobileMatlaPopup(true);
				closeMobileSidePanel();
			});

			els.prevPage.addEventListener("click", () => {
				goToBookPage(-1);
			});

			els.nextPage.addEventListener("click", () => {
				goToBookPage(1);
			});

			// Let a vertical mouse wheel scroll the horizontal page-number strip
			els.pageStrip.addEventListener("wheel", (e) => {
				if (e.deltaY === 0) return;
				e.preventDefault();
				// RTL layout: scrolling down should move toward later pages (visually leftward)
				els.pageStrip.scrollLeft -= e.deltaY;
			}, { passive: false });

		}

		function openImgLightbox(src) {
			const lb = document.getElementById('imgLightbox');
			document.getElementById('imgLightboxImg').src = src;
			lb.classList.add('open');
			document.body.style.overflow = 'hidden';
		}

		function closeImgLightbox() {
			const lb = document.getElementById('imgLightbox');
			lb.classList.remove('open');
			document.getElementById('imgLightboxImg').src = '';
			if (!state.searchVisible) document.body.style.overflow = '';
		}

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') closeImgLightbox();
		});

		els.filtersPanel.classList.add("is-hidden");
		els.searchOverlay.classList.add("is-hidden");
		attachEvents();
		loadCsvFile();
