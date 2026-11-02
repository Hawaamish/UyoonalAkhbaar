// Extracted from hamish.html. Existing section comments describe the page's behavior.

// =============================================
        // Width Adjustment System
        // =============================================
        const DEFAULT_PAGE_WIDTH = 120;
        const DEFAULT_WORD_WIDTH = 200;
        const WIDTH_STEP = 20;
        const MAX_SIDEBAR_WIDTH = 400;
        const MIN_SIDEBAR_WIDTH = 80;
        const DEFAULT_FONT_SIZE = 1.5;
        const MOBILE_DEFAULT_FONT_SIZE = 1.3;
        const DEFAULT_ZEN_THEME = 'earth';
        
        function loadWidths() {
            const savedPageWidth = localStorage.getItem('pageWidth');
            const savedWordWidth = localStorage.getItem('wordWidth');
            
            if (savedPageWidth) {
                document.documentElement.style.setProperty('--page-sidebar-width', savedPageWidth + 'px');
            }
            if (savedWordWidth) {
                document.documentElement.style.setProperty('--word-sidebar-width', savedWordWidth + 'px');
            }
        }
        
        function saveWidths() {
            const pageWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--page-sidebar-width'));
            const wordWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--word-sidebar-width'));
            localStorage.setItem('pageWidth', pageWidth);
            localStorage.setItem('wordWidth', wordWidth);
        }
        
        function adjustWidths(delta) {
            const root = document.documentElement;
            const currentPageWidth = parseInt(getComputedStyle(root).getPropertyValue('--page-sidebar-width'));
            const currentWordWidth = parseInt(getComputedStyle(root).getPropertyValue('--word-sidebar-width'));
            
            const newPageWidth = Math.min(Math.max(currentPageWidth + delta, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
            const newWordWidth = Math.min(Math.max(currentWordWidth + (delta * 1.5), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
            
            root.style.setProperty('--page-sidebar-width', newPageWidth + 'px');
            root.style.setProperty('--word-sidebar-width', newWordWidth + 'px');
            
            saveWidths();
        }
        
        function resetWidths() {
            document.documentElement.style.setProperty('--page-sidebar-width', DEFAULT_PAGE_WIDTH + 'px');
            document.documentElement.style.setProperty('--word-sidebar-width', DEFAULT_WORD_WIDTH + 'px');
            localStorage.removeItem('pageWidth');
            localStorage.removeItem('wordWidth');
        }
        
        function applyFontSize(size) {
            displayInfo.style.fontSize = `${size}rem`;
            fontSizeLabel.textContent = `${Math.round(size * 100)}%`;
        }

        function loadFontSize() {
            const savedSize = parseFloat(localStorage.getItem('detailsFontSize'));
            if (!isNaN(savedSize) && savedSize >= 0.8 && savedSize <= 4.0) {
                applyFontSize(savedSize);
            } else {
                applyFontSize(DEFAULT_FONT_SIZE);
                saveFontSize(DEFAULT_FONT_SIZE);
            }
        }

        function saveFontSize(size) {
            localStorage.setItem('detailsFontSize', size);
        }

        function adjustFontSize(delta) {
            const currentSize = parseFloat(getComputedStyle(displayInfo).fontSize) / 16;
            const nextSize = Math.min(Math.max(currentSize + delta, 0.8), 4.0);
            applyFontSize(nextSize);
            saveFontSize(nextSize);
        }

        function resetFontSize() {
            applyFontSize(DEFAULT_FONT_SIZE);
            saveFontSize(DEFAULT_FONT_SIZE);
        }

        function applyMobileFontSize(size) {
            mobileDisplayInfo.style.fontSize = `${size}rem`;
            if (mobileFontSizeLabel) mobileFontSizeLabel.textContent = `${Math.round(size * 100)}%`;
        }

        function loadMobileFontSize() {
            const savedSize = parseFloat(localStorage.getItem('mobileDetailsFontSize'));
            if (!isNaN(savedSize) && savedSize >= 0.8 && savedSize <= 4.0) {
                applyMobileFontSize(savedSize);
            } else {
                applyMobileFontSize(MOBILE_DEFAULT_FONT_SIZE);
                saveMobileFontSize(MOBILE_DEFAULT_FONT_SIZE);
            }
        }

        function saveMobileFontSize(size) {
            localStorage.setItem('mobileDetailsFontSize', size);
        }

        function adjustMobileFontSize(delta) {
            const currentSize = parseFloat(getComputedStyle(mobileDisplayInfo).fontSize) / 16;
            const nextSize = Math.min(Math.max(currentSize + delta, 0.8), 4.0);
            applyMobileFontSize(nextSize);
            saveMobileFontSize(nextSize);
        }

        function resetMobileFontSize() {
            applyMobileFontSize(MOBILE_DEFAULT_FONT_SIZE);
            saveMobileFontSize(MOBILE_DEFAULT_FONT_SIZE);
        }

        function updateThemeSwatch(themeName) {
            if (!zenThemeSelect || !zenPaletteButton) return;

            const swatches = {
                earth: 'linear-gradient(90deg, #f3e7d2 0 33%, #7f8f80 33% 66%, #b67a54 66% 100%)',
                sage: 'linear-gradient(90deg, #dfe9d7 0 33%, #6f9178 33% 66%, #c59b72 66% 100%)',
                mist: 'linear-gradient(90deg, #dde7ea 0 33%, #6f8f9a 33% 66%, #9b7b67 66% 100%)',
                rose: 'linear-gradient(90deg, #f1ddda 0 33%, #96746a 33% 66%, #c07b62 66% 100%)'
            };

            zenPaletteButton.style.backgroundImage = swatches[themeName] || swatches.earth;
            zenPaletteButton.style.backgroundColor = '#efe8db';

            if (zenPaletteMenu) {
                zenPaletteMenu.querySelectorAll('.zen-swatch').forEach((button) => {
                    button.classList.toggle('is-active', button.dataset.theme === themeName);
                });
            }
        }

        function applyZenTheme(themeName) {
            document.body.setAttribute('data-zen-theme', themeName);
            if (zenThemeSelect) {
                zenThemeSelect.value = themeName;
            }
            updateThemeSwatch(themeName);
        }

        function loadZenTheme() {
            const savedTheme = localStorage.getItem('zenTheme');
            const allowedThemes = ['earth', 'sage', 'mist', 'rose'];
            const theme = allowedThemes.includes(savedTheme) ? savedTheme : DEFAULT_ZEN_THEME;
            applyZenTheme(theme);
            localStorage.setItem('zenTheme', theme);
        }

        function handleZenThemeChange(e) {
            const theme = e.target.value;
            applyZenTheme(theme);
            localStorage.setItem('zenTheme', theme);
        }

        function toggleZenPaletteMenu() {
            if (!zenPaletteMenu || !zenPaletteButton) return;
            const isOpen = zenPaletteMenu.classList.toggle('is-open');
            zenPaletteMenu.classList.toggle('hidden', !isOpen);
            zenPaletteButton.setAttribute('aria-expanded', String(isOpen));
        }

        function closeZenPaletteMenu() {
            if (!zenPaletteMenu || !zenPaletteButton) return;
            zenPaletteMenu.classList.add('hidden');
            zenPaletteMenu.classList.remove('is-open');
            zenPaletteButton.setAttribute('aria-expanded', 'false');
        }
        
        // Load widths on page load
        loadWidths();
        
        // =============================================
        // State Management
        // =============================================
        let fullData = [];
        let sidebarOpen = false;
        let currentWordIndex = -1; // Tracks the current active word
        let currentPageNum = null; // Tracks the page shown on the mobile words screen
        let lastSearchTerm = '';
        let advancedSearchActive = false;

        // =============================================
        // Supabase Configuration
        // =============================================
        const SUPABASE_URL = 'https://xbxpcgrwxrlqxxgtdtgp.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_TvFKfakJN3BmxVGVA6Kdhw_secO1Mi3';
        const SUPABASE_TABLE = 'hamish_data';
        const SUPABASE_EXTENDED_TABLE = 'SH_data';

        // Accept either project URL or copied REST URL and normalize to project URL.
        const normalizedSupabaseUrl = SUPABASE_URL.replace(/\/rest\/v1(?:\/.*)?$/i, '');
        const supabaseClient = window.supabase
            ? window.supabase.createClient(normalizedSupabaseUrl, SUPABASE_ANON_KEY)
            : null;

        // =============================================
        // DOM Elements
        // =============================================
        const menuToggle = document.getElementById('menuToggle');
        const pageList = document.getElementById('pageList');
        const mobilePageList = document.getElementById('mobilePageList');
        const wordList = document.getElementById('wordList');
        const mobileWordList = document.getElementById('mobileWordList');
        const searchInput = document.getElementById('searchInput');
        const clearSearchButton = document.getElementById('clearSearchButton');
        const advancedSearchToggle = document.getElementById('advancedSearchToggle');
        const advancedSearchHint = document.getElementById('advancedSearchHint');
        const advancedSearchPanel = document.getElementById('advancedSearchPanel');
        const advancedSearchInput = document.getElementById('advancedSearchInput');
        const advancedSearchClear = document.getElementById('advancedSearchClear');
        const mobileAdvancedSearchModal = document.getElementById('mobileAdvancedSearchModal');
        const mobileAdvancedSearchInput = document.getElementById('mobileAdvancedSearchInput');
        const mobileAdvancedSearchGo = document.getElementById('mobileAdvancedSearchGo');
        const mobileAdvancedSearchClose = document.getElementById('mobileAdvancedSearchClose');
        const mobileAdvancedSearchCancel = document.getElementById('mobileAdvancedSearchCancel');
        const pageSidebar = document.getElementById('pageSidebar');
        const wordSidebar = document.getElementById('wordSidebar');
        const welcomeMessage = document.getElementById('welcomeMessage');
        const detailsArea = document.getElementById('detailsArea');
        const displayInfo = document.getElementById('displayInfo');
        const fontSizeLabel = document.getElementById('fontSizeLabel');
        const selectedPageLabel = document.getElementById('selectedPageLabel');
        const selectedPageNumber = document.getElementById('selectedPageNumber');
        const mobileSelectedPageLabel = document.getElementById('mobileSelectedPageLabel');
        const mobileSelectedPageNumber = document.getElementById('mobileSelectedPageNumber');
        const focusModeToggle = document.getElementById('focusModeToggle');
        const zenThemeSelect = document.getElementById('zenThemeSelect');
        const zenPaletteButton = document.getElementById('zenPaletteButton');
        const zenPaletteMenu = document.getElementById('zenPaletteMenu');
        const mobileBackToPages = document.getElementById('mobileBackToPages');
        const mobileBackToWords = document.getElementById('mobileBackToWords');
        const mobilePrevWord = document.getElementById('mobilePrevWord');
        const mobileNextWord = document.getElementById('mobileNextWord');
        const mobilePrevPage = document.getElementById('mobilePrevPage');
        const mobileNextPage = document.getElementById('mobileNextPage');
        const mobileDisplayPage = document.getElementById('mobileDisplayPage');
        const mobileDisplayWord = document.getElementById('mobileDisplayWord');
        const mobileDisplayInfo = document.getElementById('mobileDisplayInfo');
        const mobileDetailsScroll = document.getElementById('mobileDetailsScroll');
        const mobileFontSizeLabel = document.getElementById('mobileFontSizeLabel');
        const mobileDetailsMenuToggle = document.getElementById('mobileDetailsMenuToggle');
        const mobileDetailsMenu = document.getElementById('mobileDetailsMenu');

        // Tracks which full-screen mobile view is active: 'pages' | 'words' | 'details'
        let mobileView = 'pages';

        function isMobileViewport() {
            return window.innerWidth < 768;
        }

        function showMobileScreen(name, options = {}) {
            if (!isMobileViewport()) return;
            mobileView = name;
            document.querySelectorAll('.mobile-screen').forEach(screen => screen.classList.remove('active'));
            const screenIds = { pages: 'mobileScreenPages', words: 'mobileScreenWords', details: 'mobileScreenDetails' };
            const screenEl = document.getElementById(screenIds[name]);
            if (screenEl) {
                screenEl.classList.add('active');
                screenEl.scrollTop = 0;
            }
            closeMobileDetailsMenu();

            // Push a history entry so the phone/browser back button steps through pages -> words -> details
            if (!options.skipHistory) {
                if (history.state && history.state.mobileScreen === name) {
                    history.replaceState({ mobileScreen: name }, '');
                } else {
                    history.pushState({ mobileScreen: name }, '');
                }
            }
        }

        // Let the native/back gesture navigate between the mobile screens instead of leaving the page
        window.addEventListener('popstate', (e) => {
            if (!isMobileViewport()) return;
            const target = (e.state && e.state.mobileScreen) || 'pages';
            showMobileScreen(target, { skipHistory: true });
        });

        function toggleMobileDetailsMenu() {
            const isHidden = mobileDetailsMenu.classList.toggle('hidden');
            mobileDetailsMenuToggle.setAttribute('aria-expanded', String(!isHidden));
        }

        function closeMobileDetailsMenu() {
            mobileDetailsMenu.classList.add('hidden');
            mobileDetailsMenuToggle.setAttribute('aria-expanded', 'false');
        }

        // Establish the base history entry so the first back-press has a 'pages' state to return to
        if (isMobileViewport()) {
            history.replaceState({ mobileScreen: 'pages' }, '');
        }

        // Load saved font size after DOM elements exist
        loadFontSize();
        loadMobileFontSize();
        loadZenTheme();

        // =============================================
        // Event Listeners
        // =============================================
        menuToggle.addEventListener('click', toggleMobileMenu);
        mobileBackToPages.addEventListener('click', () => showMobileScreen('pages'));
        mobileBackToWords.addEventListener('click', () => showMobileScreen('words'));
        mobilePrevWord.addEventListener('click', () => navigateWords(-1));
        mobileNextWord.addEventListener('click', () => navigateWords(1));
        mobilePrevPage.addEventListener('click', () => navigateMobilePage(-1));
        mobileNextPage.addEventListener('click', () => navigateMobilePage(1));
        mobileDetailsMenuToggle.addEventListener('click', toggleMobileDetailsMenu);
        function updateSearchControls() {
            const hasSearchText = searchInput.value.trim() !== '';
            clearSearchButton.classList.toggle('hidden', !hasSearchText);
            advancedSearchHint.classList.toggle('hidden', !hasSearchText);
            advancedSearchHint.textContent = advancedSearchActive
                ? 'اضغط هنا للبحث العادي'
                : 'اضغط هنا للبحث المتقدم';
            advancedSearchToggle.classList.toggle('search-ready', hasSearchText);
            advancedSearchToggle.setAttribute('aria-pressed', String(advancedSearchActive));
        }

        searchInput.addEventListener('input', (event) => {
            advancedSearchActive = false;
            handleSearch(event);
            updateSearchControls();
        });
        advancedSearchToggle.addEventListener('click', () => {
            if (!searchInput.value.trim()) {
                advancedSearchActive = false;
                handleSearch({ target: searchInput });
            } else if (advancedSearchActive) {
                advancedSearchActive = false;
                handleSearch({ target: searchInput });
            } else {
                advancedSearchActive = true;
                performAdvancedSearch(searchInput.value);
            }
            updateSearchControls();
        });
        clearSearchButton.addEventListener('click', () => {
            searchInput.value = '';
            advancedSearchActive = false;
            handleSearch({ target: searchInput });
            updateSearchControls();
            searchInput.focus();
        });
        advancedSearchInput.addEventListener('input', handleAdvancedSearch);
        advancedSearchClear.addEventListener('click', clearAdvancedSearch);
        mobileAdvancedSearchGo.addEventListener('click', () => {
            performAdvancedSearch(mobileAdvancedSearchInput.value);
            closeMobileAdvancedSearchModal();
        });
        mobileAdvancedSearchClose.addEventListener('click', closeMobileAdvancedSearchModal);
        mobileAdvancedSearchCancel.addEventListener('click', closeMobileAdvancedSearchModal);
        mobileAdvancedSearchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                mobileAdvancedSearchGo.click();
            }
        });
        document.getElementById('pageSearchInput').addEventListener('input', handlePageSearch);
        document.getElementById('mobilePageSearchInput').addEventListener('input', handlePageSearch);
        
        // Width adjustment buttons
        document.getElementById('decreaseWidth').addEventListener('click', () => adjustWidths(-WIDTH_STEP));
        document.getElementById('increaseWidth').addEventListener('click', () => adjustWidths(WIDTH_STEP));
        document.getElementById('resetWidth').addEventListener('click', resetWidths);

        // Font size adjustment buttons for the information box
        document.getElementById('decreaseFont').addEventListener('click', () => adjustFontSize(-0.1));
        document.getElementById('increaseFont').addEventListener('click', () => adjustFontSize(0.1));
        document.getElementById('resetFont').addEventListener('click', resetFontSize);
        document.getElementById('mobileDecreaseFont').addEventListener('click', () => adjustMobileFontSize(-0.1));
        document.getElementById('mobileIncreaseFont').addEventListener('click', () => adjustMobileFontSize(0.1));
        document.getElementById('mobileResetFont').addEventListener('click', resetMobileFontSize);

        // Optional distraction-free mode: visual class toggle only.
        if (focusModeToggle) {
            focusModeToggle.addEventListener('click', toggleFocusMode);
        }

        if (zenThemeSelect) {
            zenThemeSelect.addEventListener('change', handleZenThemeChange);
        }

        if (zenPaletteButton) {
            zenPaletteButton.addEventListener('click', toggleZenPaletteMenu);
        }

        if (zenPaletteMenu) {
            const selectZenTheme = (event) => {
                const swatch = event.target.closest('.zen-swatch');
                if (!swatch || !zenPaletteMenu.contains(swatch)) return;

                event.preventDefault();
                event.stopPropagation();
                const theme = swatch.dataset.theme;
                applyZenTheme(theme);
                localStorage.setItem('zenTheme', theme);
                closeZenPaletteMenu();
            };

            // Pointer activation covers mouse, touch, and pen input.
            zenPaletteMenu.addEventListener('pointerup', selectZenTheme);
            // Keep keyboard activation available for focused swatches.
            zenPaletteMenu.addEventListener('click', (event) => {
                if (event.detail === 0) selectZenTheme(event);
            });
        }

        document.addEventListener('click', (e) => {
            const picker = document.querySelector('.zen-palette-picker');
            if (!picker) return;
            if (!picker.contains(e.target)) {
                closeZenPaletteMenu();
            }
        });

        // Load Data Directly From Supabase
        const DATA_CACHE_KEY = 'hamishDataCache_v2';
        loadDataFromSupabase();

        // Show a cached copy instantly (if we have one) while a fresh copy loads in the background.
        function loadCachedData() {
            try {
                const cached = localStorage.getItem(DATA_CACHE_KEY);
                if (!cached) return false;
                const rows = JSON.parse(cached);
                if (!Array.isArray(rows) || rows.length === 0) return false;
                fullData = rows;
                renderPageSidebar(fullData);
                return true;
            } catch (err) {
                console.warn('Could not read cached data:', err);
                return false;
            }
        }

        function saveCachedData(rows) {
            try {
                localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(rows));
            } catch (err) {
                // Cache is best-effort (e.g. storage full/disabled); ignore failures.
                console.warn('Could not cache data:', err);
            }
        }

        async function loadDataFromSupabase() {
            const hadCache = loadCachedData();

            try {
                if (!supabaseClient) {
                    throw new Error('Supabase client is unavailable');
                }

                const [hamishRows, extendedRows] = await Promise.all([
                    loadSupabaseTable(SUPABASE_TABLE, 'hamish_data'),
                    loadSupabaseTable(SUPABASE_EXTENDED_TABLE, 'SH_data')
                ]);

                fullData = hamishRows.concat(extendedRows)
                    .filter(row => row.Word)
                    .sort((a, b) => compareMixed(a.Page, b.Page) || compareMixed(a.Line, b.Line));

                renderPageSidebar(fullData);
                saveCachedData(fullData);
            } catch (err) {
                console.error('Supabase load failed:', err);
                // If we already showed cached data, keep it on screen rather than
                // replacing it with an error — the cache is still usable.
                if (hadCache) return;
                const details = err?.message ? `: ${err.message}` : '';
                const message = `<p class="text-xs text-red-500">فشل تحميل البيانات من قاعدة البيانات${details}</p>`;
                pageList.innerHTML = message;
                mobilePageList.innerHTML = '<p class="col-span-4 text-xs text-red-500">فشل تحميل البيانات</p>';
                wordList.innerHTML = message;
                mobileWordList.innerHTML = message;
            }
        }

        async function loadSupabaseTable(tableName, sourceName) {
            // Supabase/PostgREST caps each request at about 1000 rows, so use the
            // exact count to fetch every page, including all 3704 SH_data rows.
            const PAGE_SIZE = 1000;
            const { count, error: countError } = await supabaseClient
                .from(tableName)
                .select('*', { count: 'exact', head: true });

            if (countError) throw countError;

            const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
            const pagePromises = Array.from({ length: pageCount }, (_, i) => {
                const from = i * PAGE_SIZE;
                return supabaseClient
                    .from(tableName)
                    .select('*')
                    .range(from, from + PAGE_SIZE - 1);
            });

            const pageResults = await Promise.all(pagePromises);
            const rows = [];
            for (const { data, error } of pageResults) {
                if (error) throw error;
                if (data) rows.push(...data);
            }

            return rows
                .map(row => normalizeRow(row, sourceName))
                .filter(row => row.Word);
        }

        function normalizeRow(row, source = 'hamish_data') {
            const page = row.Page ?? row.page ?? '';
            const line = row.Line ?? row.line ?? '';
            const word = row.Word ?? row.word ?? '';
            const information = row.Information ?? row.information ?? '';
            const media = row.media ?? row.Media ?? '';
            const links = row.links ?? row.Links ?? '';
            const unzur = row.unzur ?? row.Unzur ?? '';

            return {
                ...row,
                Page: String(page).trim(),
                Line: String(line).trim(),
                Word: String(word).trim(),
                Information: String(information),
                media: String(media),
                links: String(links),
                unzur: String(unzur),
                source
            };
        }

        function compareMixed(a, b) {
            const aNum = Number(a);
            const bNum = Number(b);
            const aIsNum = Number.isFinite(aNum);
            const bIsNum = Number.isFinite(bNum);

            if (aIsNum && bIsNum) return aNum - bNum;
            if (aIsNum) return -1;
            if (bIsNum) return 1;
            return String(a).localeCompare(String(b), 'ar');
        }

        // =============================================
        // Mobile Menu Functions
        // =============================================
        function toggleMobileMenu() {
            sidebarOpen = !sidebarOpen;
            
            if(sidebarOpen) {
                pageSidebar.classList.remove('hidden');
                pageSidebar.classList.add('fixed', 'bottom-0', 'right-0', 'top-20', 'z-40', 'w-64', 'border-l', 'flex', 'flex-col');
                wordSidebar.classList.remove('hidden');
                wordSidebar.classList.add('absolute', 'hidden');
            } else {
                pageSidebar.classList.add('hidden');
                pageSidebar.classList.remove('fixed', 'bottom-0', 'right-0', 'top-20', 'z-40', 'w-64', 'border-l', 'flex', 'flex-col');
                wordSidebar.classList.add('hidden');
            }
        }

        function closeMobileMenu() {
            if(window.innerWidth < 768) {
                sidebarOpen = false;
                pageSidebar.classList.add('hidden');
                wordSidebar.classList.add('hidden');
            }
        }

        // =============================================
        // Page Functions
        // =============================================
        function renderPageSidebar(data) {
    const pages = [...new Set(data.map(item => item.Page))].sort((a, b) => a - b);
    
    // Desktop Buttons
    const pageHTML = pages.map(p => `
        <button onclick="filterWordsByPage('${p}')" class="page-button">
            ${p}
        </button>
    `).join('');
    
    // Mobile Buttons (added the same class)
    const mobilePageHTML = pages.map(p => `
        <button onclick="filterWordsByPage('${p}')" class="page-button">
            ${p}
        </button>
    `).join('');
    
    pageList.innerHTML = pageHTML;
    mobilePageList.innerHTML = mobilePageHTML;
}

        function filterWordsByPage(pageNum) {
    currentPageNum = pageNum;

    // Only auto-scroll to the button when the click came from a page search result
    const wasSearching = document.getElementById('pageSearchInput').value.trim() !== '' ||
        document.getElementById('mobilePageSearchInput').value.trim() !== '';

    // Reset the search box and restore the full page list so other pages stay visible after selecting one
    document.getElementById('pageSearchInput').value = '';
    document.getElementById('mobilePageSearchInput').value = '';
    renderPageSidebar(fullData);

    // Add highlight to the clicked page button
    // We search for the button that has the text matching the page number
    const pageButtons = document.querySelectorAll('.page-button');
    pageButtons.forEach(btn => {
        if (btn.textContent.trim() === pageNum.toString()) {
            btn.classList.add('active-page');
            if (wasSearching) {
                btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }
    });

    // 3. Existing logic to show words
    const filtered = fullData.filter(item => item.Page === pageNum);
    displayWords(filtered, pageNum);
    
    if (window.innerWidth < 768) {
        closeMobileMenu();
        showMobileScreen('words');
    }
}

        function navigateMobilePage(direction) {
            if (currentPageNum === null) return;
            const pages = [...new Set(fullData.map(item => item.Page))].sort((a, b) => a - b);
            const currentIndex = pages.indexOf(currentPageNum);
            if (currentIndex === -1) return;
            const newIndex = currentIndex + direction;
            if (newIndex >= 0 && newIndex < pages.length) {
                filterWordsByPage(pages[newIndex]);
            }
        }

        // =============================================
        // Word Display Functions
        // =============================================
        function displayWords(words, pageNum = null) {
    const wordHTML = words.map(w => {
        const index = fullData.indexOf(w);
        const hasLook = w.unzur && w.unzur.includes("انظر");
        const lookIcon = hasLook ? '<span class="text-red-600 mr-1">📎</span> ' : '';
        const wordStyle = [
            hasLook ? 'text-red-600 font-bold' : '',
            w.source === 'SH_data' ? 'sh-data-word' : ''
        ].filter(Boolean).join(' ');

        // CLEANED: Only using word-button class
        return `
            <button class="word-button${w.source === 'SH_data' ? ' sh-data-button' : ''}" data-index="${index}">
                <span class="${wordStyle}">${lookIcon}${w.Word}</span> 
                <span class="text-[10px] opacity-50">[س ${w.Line}]</span>
            </button>
        `;
    }).join('');
    
    wordList.innerHTML = wordHTML;
    mobileWordList.innerHTML = wordHTML;
            
            // Add event listeners to word buttons
            document.querySelectorAll('.word-button').forEach(button => {
                button.addEventListener('click', function() {
                    const index = this.dataset.index;
                    const item = fullData[index];
                    showDetails(item.Word, item.Page, item.Information, item.media, item.links, item.source);
                });
            });
            
            // Show page number label if pageNum is provided
            if(pageNum !== null) {
                selectedPageNumber.innerText = pageNum;
                selectedPageLabel.classList.remove('hidden');
                mobileSelectedPageNumber.innerText = pageNum;
                mobileSelectedPageLabel.classList.remove('hidden');
            }
            
            if(words.length > 0) {
                welcomeMessage.classList.add('hidden');
            }
        }

        function showDetails(word, page, info, mediaFile, links, source = 'hamish_data') {
    document.getElementById('welcomeMessage').classList.add('hidden');
    document.getElementById('detailsArea').classList.remove('hidden');
    document.getElementById('displayPage').innerText = page;
    document.getElementById('displayWord').innerText = word;
    mobileDisplayPage.innerText = page;
    mobileDisplayWord.innerText = word;
    currentWordIndex = fullData.findIndex(item => item.Word === word && item.Page === page && item.source === source);
    
    // Highlight word
    document.querySelectorAll('.word-button').forEach(btn => btn.classList.remove('active-word'));
    const activeWordBtn = document.querySelector(`.word-button[data-index="${currentWordIndex}"]`);
    if (activeWordBtn) {
        activeWordBtn.classList.add('active-word');
        activeWordBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Highlight and Scroll Page in Sidebar
    let pageBtn = Array.from(document.querySelectorAll('#pageList .page-button'))
        .find(btn => btn.textContent.trim() === page.toString());
    
    let mobilePageBtn = Array.from(document.querySelectorAll('#mobilePageList .page-button'))
        .find(btn => btn.textContent.trim() === page.toString());

    if (!pageBtn && page) {
        document.getElementById('pageSearchInput').value = '';
        document.getElementById('mobilePageSearchInput').value = '';
        renderPageSidebar(fullData);
        pageBtn = Array.from(document.querySelectorAll('#pageList .page-button'))
            .find(btn => btn.textContent.trim() === page.toString());
        mobilePageBtn = Array.from(document.querySelectorAll('#mobilePageList .page-button'))
            .find(btn => btn.textContent.trim() === page.toString());
    }

    document.querySelectorAll('.page-button').forEach(btn => btn.classList.remove('active-page'));
    
    if (pageBtn) {
        pageBtn.classList.add('active-page');
        pageBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (mobilePageBtn) {
        mobilePageBtn.classList.add('active-page');
        mobilePageBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    
    const processedInfo = enhanceInfoHtml(info);
    const highlightedInfo = lastSearchTerm ? highlightMatch(processedInfo, lastSearchTerm) : processedInfo;
    const displayInfoEl = document.getElementById('displayInfo');
    displayInfoEl.innerHTML = highlightedInfo;
    displayInfoEl.scrollTop = 0;
    mobileDisplayInfo.innerHTML = highlightedInfo;
    if (mobileDetailsScroll) mobileDetailsScroll.scrollTop = 0;

    const mainScroller = displayInfoEl.closest('main');
    if (mainScroller) {
        mainScroller.scrollTo({ top: 0, behavior: 'auto' });
    }


    function getDriveFileId(value) {
        if (!value) return null;
        const trimmed = cleanToken(value);

        // Allow plain Drive file IDs directly in the media column.
        if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes('/')) {
            return trimmed;
        }

        const pathId = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (pathId) return pathId;

        try {
            const parsed = new URL(trimmed);
            return parsed.searchParams.get('id');
        } catch (e) {
            return null;
        }
    }

    function getFileExt(value) {
        const cleaned = cleanToken(value).split('?')[0].split('#')[0];
        const lastDot = cleaned.lastIndexOf('.');
        if (lastDot === -1) return '';
        return cleaned.substring(lastDot + 1).toLowerCase();
    }

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(cleanToken(value));
    }

    function isDriveUcLink(value) {
        return /drive\.google\.com\/uc\?/i.test(String(value || ''));
    }

    function normalizeDriveUcImageUrl(value) {
        try {
            const parsed = new URL(cleanToken(value));
            const id = parsed.searchParams.get('id');
            if (!id) return cleanToken(value);
            return `https://drive.google.com/uc?export=view&id=${id}`;
        } catch (e) {
            return cleanToken(value);
        }
    }

    function decodeHtmlEntities(value) {
        const txt = document.createElement('textarea');
        txt.innerHTML = String(value || '');
        return txt.value;
    }

    function cleanToken(value) {
        let v = decodeHtmlEntities(value).trim();
        v = v.replace(/^['"]|['"]$/g, '');
        return v;
    }

    function getDriveImageSources(fileId, rawValue) {
        const sources = [];
        const cleaned = cleanToken(rawValue);
        const ucFromInput = isDriveUcLink(cleaned) ? normalizeDriveUcImageUrl(cleaned) : '';

        if (ucFromInput) sources.push(ucFromInput);
        if (fileId) {
            sources.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`);
            sources.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
            sources.push(`https://lh3.googleusercontent.com/d/${fileId}=w2000`);
        }

        return [...new Set(sources.filter(Boolean))];
    }

    function handleDriveImageFallback(img) {
        const remaining = (img.dataset.driveFallbacks || '').split('|').filter(Boolean);
        if (remaining.length > 0) {
            const nextSrc = remaining.shift();
            img.dataset.driveFallbacks = remaining.join('|');
            img.src = nextSrc;
            return;
        }

        img.style.display = 'none';
        const frame = img.nextElementSibling;
        if (frame && frame.tagName === 'IFRAME') {
            frame.classList.remove('hidden');
        }
    }

    // onerror attributes execute in global scope, so expose this helper.
    window.handleDriveImageFallback = handleDriveImageFallback;

    // Text between "}}" and "{{" (any order, may span paragraphs) gets the Kanz font.
    function applyKanzMarkers(html) {
        if (!/\}\}|\{\{/.test(html)) return html;
        let active = false;
        return html.split(/(<[^>]*>)/).map(part => {
            if (part.startsWith('<') && part.endsWith('>')) return part;
            return part.split(/(\}\}|\{\{)/).map(seg => {
                if (seg === '}}' || seg === '{{') {
                    active = !active;
                    return '';
                }
                return active && seg.trim() ? `<span class="kanz-text">${seg}</span>` : seg;
            }).join('');
        }).join('');
    }

    function enhanceInfoHtml(rawHtml) {
        const decoded = applyKanzMarkers(decodeHtmlEntities(rawHtml || ''));
        const withSeparators = decoded.replace(/\*\*\*/g, '<hr class="my-4 border-t-2 border-gray-300">');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = withSeparators;

        const markerPattern = /(^|\s)(رض|ع م|صلع|ص ع|تع|قس)(?=\s|$)/g;
        const textWalker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (textWalker.nextNode()) textNodes.push(textWalker.currentNode);

        textNodes.forEach(node => {
            if (!markerPattern.test(node.nodeValue)) {
                markerPattern.lastIndex = 0;
                return;
            }
            markerPattern.lastIndex = 0;
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            node.nodeValue.replace(markerPattern, (match, leadingSpace, marker, offset) => {
                fragment.append(node.nodeValue.slice(lastIndex, offset));
                if (leadingSpace) fragment.append(leadingSpace);
                const superscript = document.createElement('sup');
                superscript.textContent = marker;
                fragment.append(superscript);
                lastIndex = offset + match.length;
                return match;
            });
            fragment.append(node.nodeValue.slice(lastIndex));
            node.replaceWith(fragment);
        });

        // Support Google Drive images that are embedded directly in Information HTML.
        wrapper.querySelectorAll('img').forEach(img => {
            const rawSrc = cleanToken(img.getAttribute('src') || '');
            const driveFileId = getDriveFileId(rawSrc);
            if (!driveFileId) return;

            const imageSources = getDriveImageSources(driveFileId, rawSrc);
            const firstImageSource = imageSources[0] || `https://drive.google.com/uc?export=view&id=${driveFileId}`;
            const remainingImageSources = imageSources.slice(1).join('|');

            img.setAttribute('src', firstImageSource);
            img.setAttribute('data-drive-fallbacks', remainingImageSources);
            img.setAttribute('onerror', 'handleDriveImageFallback(this)');

            if (!img.classList.contains('max-w-full')) {
                img.classList.add('max-w-full', 'h-auto', 'rounded-lg', 'shadow-md', 'mx-auto');
            }
        });

        return wrapper.innerHTML;
    }
    
    function renderMediaInto(mediaContainer, mediaContent) {
    mediaContent.innerHTML = "";
    mediaContainer.classList.add('hidden');

    // --- STEP 1: Process Local Media (Column 5) ---
    // --- STEP 1: Process Local Media (Column 5) ---
if (mediaFile && mediaFile.trim() !== "" && mediaFile !== "undefined") {
    mediaContainer.classList.remove('hidden');
    const mediaFiles = mediaFile.split(',').map(item => cleanToken(item)).filter(item => item !== "");
    
    mediaFiles.forEach((fileValue) => {
        const mediaItemContainer = document.createElement('div');
        mediaItemContainer.classList.add('mb-6');
        const driveFileId = getDriveFileId(fileValue);
        const fileExt = getFileExt(fileValue);
        const filePath = isHttpUrl(fileValue) ? cleanToken(fileValue) : `assets/${cleanToken(fileValue)}`;

        if (driveFileId) {
            const imageSources = getDriveImageSources(driveFileId, fileValue);
            const firstImageSource = imageSources[0] || `https://drive.google.com/uc?export=view&id=${driveFileId}`;
            const remainingImageSources = imageSources.slice(1).join('|');
            const previewUrl = `https://drive.google.com/file/d/${driveFileId}/preview`;

            // Try direct image first for media-column Drive images; fallback to preview iframe.
            mediaItemContainer.innerHTML = `
                <img src="${firstImageSource}" 
                     data-drive-fallbacks="${remainingImageSources}"
                     onerror="handleDriveImageFallback(this)"
                     class="max-w-full h-auto rounded-lg shadow-md mx-auto">
                <iframe src="${previewUrl}" class="hidden w-full h-64 sm:h-96 md:h-[500px] rounded border shadow-md" allowfullscreen loading="lazy"></iframe>`;
            mediaContent.appendChild(mediaItemContainer);
            return;
        }

        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
            // Added onerror="this.style.display='none'" to hide broken bitmaps
            mediaItemContainer.innerHTML = `
                <img src="${filePath}" 
                     onerror="this.style.display='none'" 
                     class="max-w-full h-auto rounded-lg shadow-md mx-auto">`;
        } else if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
            mediaItemContainer.innerHTML = `<video controls class="max-w-full h-auto rounded-lg shadow-md mx-auto"><source src="${filePath}"></video>`;
        } else if (['mp3', 'wav'].includes(fileExt)) {
            mediaItemContainer.innerHTML = `<audio controls class="w-full mt-2"><source src="${filePath}"></audio>`;
        } else {
            mediaItemContainer.innerHTML = `<a href="${filePath}" target="_blank" class="bg-blue-500 text-white px-4 py-2 rounded inline-block text-sm">تحميل ملف مرفق</a>`;
        }
        mediaContent.appendChild(mediaItemContainer);
    });
}

    // --- STEP 2: Process External Links / Drive (Column 6) ---
    if (links && links.trim() !== "" && links !== "undefined") {
        mediaContainer.classList.remove('hidden');
        const linkList = links.split(',').map(l => cleanToken(l)).filter(l => l !== "");
        linkList.forEach((link) => {
            const linkItemContainer = document.createElement('div');
            linkItemContainer.classList.add('mt-4', 'border-t', 'pt-4');

            // Folder detection
            const isDriveFolder = /drive\.google\.com\/drive\/folders\//.test(link);
            const isWebFolder = /\/folders(\/|$)/.test(link) || /\/folder(\/|$)/.test(link) || /\/$/.test(link);
            const isLocalFolder = (link.match(/^[a-zA-Z]:\\|^\\|^\//) && !/\.[a-zA-Z0-9]+$/.test(link));
            const isFolder = isDriveFolder || isWebFolder || isLocalFolder;

            if (isFolder) {
                // Show the blue button for folder links at their position
                const folderBtn = document.createElement('button');
                folderBtn.textContent = 'اضغط هنا لفتح المجموعة الكاملة';
                folderBtn.className = 'block mx-auto mt-6 bg-blue-500 hover:bg-blue-900 text-white font-bold py-2 px-2 rounded-lg text-base transition';
                folderBtn.style.width = 'fit-content';
                folderBtn.onclick = function() {
                    window.open(link, '_blank');
                };
                linkItemContainer.appendChild(folderBtn);
            } else if (link.includes('drive.google.com')) {
                // Google Drive FILE
                const fileIdFromPath = link.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
                let fileIdFromQuery = null;

                try {
                    const parsedUrl = new URL(link);
                    fileIdFromQuery = parsedUrl.searchParams.get('id');
                } catch (e) {
                    // Ignore invalid URLs and fall back to path-only parsing.
                }

                const fileId = fileIdFromPath || fileIdFromQuery;
                if (fileId) {
                    const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
                    linkItemContainer.innerHTML = `
                        <iframe src="${embedUrl}" class="w-full h-64 sm:h-96 md:h-[500px] rounded border shadow-md" allowfullscreen loading="lazy"></iframe>
                        <div class="flex justify-center mt-4">
                            <a href="${link}" target="_blank" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition text-sm">فتح في نافذة جديدة</a>
                        </div>`;
                } else {
                    // fallback for other drive links
                    linkItemContainer.innerHTML = `<a href="${link}" target="_blank" class="block text-center p-3 bg-gray-50 border rounded text-blue-600 font-bold hover:underline">🔗 رابط خارجي: ${link}</a>`;
                }
            } else {
                linkItemContainer.innerHTML = `<a href="${link}" target="_blank" class="block text-center p-3 bg-gray-50 border rounded text-blue-600 font-bold hover:underline">🔗 رابط خارجي: ${link}</a>`;
            }
            mediaContent.appendChild(linkItemContainer);
        });
    }
    }

    renderMediaInto(document.getElementById('mediaContainer'), document.getElementById('mediaContent'));
    renderMediaInto(document.getElementById('mobileMediaContainer'), document.getElementById('mobileMediaContent'));
    
    closeMobileMenu();

    if (window.innerWidth < 768) {
        showMobileScreen('details');
    }
}

        // =============================================
        // Page Search Function
        // =============================================
        function handlePageSearch(e) {
            const searchTerm = e.target.value.trim();
            const pages = [...new Set(fullData.map(item => item.Page))].sort((a, b) => a - b);
            
            let filteredPages = pages;
            if(searchTerm !== "") {
                filteredPages = pages.filter(p => p.toString().includes(searchTerm));
            }
            
            const pageHTML = filteredPages.map(p => `
                <button onclick="filterWordsByPage('${p}')" class="page-button">
                    ${p}
                </button>
            `).join('');
            
            const mobilePageHTML = filteredPages.map(p => `
                <button onclick="filterWordsByPage('${p}')" class="page-button">
                    ${p}
                </button>
            `).join('');
            
            pageList.innerHTML = pageHTML || '<p class="text-xs text-gray-400 col-span-4">لا توجد صفحات</p>';
            mobilePageList.innerHTML = mobilePageHTML || '<p class="col-span-4 text-xs text-gray-400">لا توجد صفحات</p>';
        }

        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function highlightMatch(text, searchTerm) {
            if (!searchTerm) return text;
            const escaped = escapeRegExp(searchTerm);
            const regex = new RegExp(escaped, 'gi');
            return text.replace(regex, match => `<mark class="search-highlight">${match}</mark>`);
        }

        function handleAdvancedSearchToggle() {
            if (window.innerWidth < 768) {
                openMobileAdvancedSearchModal();
            } else {
                advancedSearchPanel.classList.toggle('hidden');
                if (!advancedSearchPanel.classList.contains('hidden')) {
                    advancedSearchInput.focus();
                }
            }
        }

        function openMobileAdvancedSearchModal() {
            mobileAdvancedSearchInput.value = '';
            mobileAdvancedSearchModal.classList.remove('hidden');
            setTimeout(() => mobileAdvancedSearchInput.focus(), 100);
        }

        function closeMobileAdvancedSearchModal() {
            mobileAdvancedSearchModal.classList.add('hidden');
        }

        function performAdvancedSearch(rawTerm) {
            const term = rawTerm.toLowerCase();
            const wordsHeader = document.getElementById('wordsHeader');
            const mobileWordsHeader = document.getElementById('mobileWordsHeader');

            if (term.trim() === "") {
                lastSearchTerm = '';
                if(wordsHeader) wordsHeader.classList.remove('hidden');
                if(mobileWordsHeader) mobileWordsHeader.classList.remove('hidden');
                wordList.innerHTML = '<p class="text-xs text-gray-400">اختر صفحة أولاً</p>';
                mobileWordList.innerHTML = '<p class="text-xs text-gray-400">اختر صفحة أولاً</p>';
                selectedPageLabel.classList.add('hidden');
                mobileSelectedPageLabel.classList.add('hidden');
                showMobileScreen('pages');
                return;
            }

            lastSearchTerm = term;
            if(wordsHeader) wordsHeader.classList.add('hidden');
            if(mobileWordsHeader) mobileWordsHeader.classList.add('hidden');

            const normalizedTerm = removeDiacritics(term);
            const results = fullData.filter(item => {
                const wordMatch = removeDiacritics(item.Word || '').toLowerCase().includes(normalizedTerm);
                const infoMatch = removeDiacritics(item.Information || '').toLowerCase().includes(normalizedTerm);
                return wordMatch || infoMatch;
            });

            if(results.length === 0) {
                const noResultsMessage = '<div class="w-full text-center py-12 mt-8"><p class="text-red-600 font-bold text-base">لا توجد نتائج</p></div>';
                wordList.innerHTML = noResultsMessage;
                mobileWordList.innerHTML = noResultsMessage;
                selectedPageLabel.classList.add('hidden');
                mobileSelectedPageLabel.classList.add('hidden');
                showMobileScreen('words');
                return;
            }

            const searchHTML = '<div class="h-2"></div>' + results.map(w => {
                const index = fullData.indexOf(w);
                const hasLook = w.unzur && w.unzur.includes("انظر");
                const lookIcon = hasLook ? '<span class="text-red-600 mr-1">📎</span> ' : '';
                const wordStyle = [
                    hasLook ? 'text-red-600 font-bold' : '',
                    w.source === 'SH_data' ? 'sh-data-word' : ''
                ].filter(Boolean).join(' ');
                const highlightedWord = highlightMatch(w.Word || '', rawTerm);

                return `
    <button class="word-button${w.source === 'SH_data' ? ' sh-data-button' : ''}" data-index="${index}">
        <span class="${wordStyle}">${lookIcon}${highlightedWord}</span> 
        <span>[س ${w.Line}]</span>
    </button>
`;
            }).join('');

            wordList.innerHTML = searchHTML;
            mobileWordList.innerHTML = searchHTML;

            document.querySelectorAll('.word-button').forEach(button => {
                button.addEventListener('click', function() {
                    const index = this.dataset.index;
                    const item = fullData[index];
                    showDetails(item.Word, item.Page, item.Information, item.media, item.links, item.source);
                });
            });

            selectedPageLabel.classList.add('hidden');
            mobileSelectedPageLabel.classList.add('hidden');
            showMobileScreen('words');
            scrollToResults();
        }

        function scrollToResults() {
            if (window.innerWidth >= 768 && wordSidebar) {
                wordSidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        function clearAdvancedSearch() {
            advancedSearchInput.value = '';
            mobileAdvancedSearchInput.value = '';
            closeMobileAdvancedSearchModal();
            wordList.innerHTML = '<p class="text-xs text-gray-400">اختر صفحة أولاً</p>';
            mobileWordList.innerHTML = '<p class="text-xs text-gray-400">اختر صفحة أولاً</p>';
            selectedPageLabel.classList.add('hidden');
            mobileSelectedPageLabel.classList.add('hidden');
            showMobileScreen('pages');
        }

        function handleAdvancedSearch(e) {
            performAdvancedSearch(e.target.value);
        }

        // =============================================
        // Search Functions
        // =============================================
        function removeDiacritics(text) {
            return text.replace(/[\u064B-\u0652]/g, '');
        }

        function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    // Get the label elements
    const wordsHeader = document.getElementById('wordsHeader');
    const mobileWordsHeader = document.getElementById('mobileWordsHeader');
    
    if(term === "") {
        lastSearchTerm = '';
        // 1. Show the labels again when search is cleared
        if(wordsHeader) wordsHeader.classList.remove('hidden');
        if(mobileWordsHeader) mobileWordsHeader.classList.remove('hidden');

        renderPageSidebar(fullData);
        wordList.innerHTML = "";
        mobileWordList.innerHTML = "<p class=\"text-xs text-gray-400\">اختر صفحة أولاً</p>";
        wordSidebar.scrollTop = 0; 
        document.getElementById('mobileWordList').parentElement.scrollTop = 0;
        selectedPageLabel.classList.add('hidden');
        mobileSelectedPageLabel.classList.add('hidden');
        showMobileScreen('pages');
        return;
    }

    lastSearchTerm = term;
    
    // 2. Hide the labels whenever a search happens
    if(wordsHeader) wordsHeader.classList.add('hidden');
    if(mobileWordsHeader) mobileWordsHeader.classList.add('hidden');

    const normalizedTerm = removeDiacritics(term);
    const results = fullData.filter(item => removeDiacritics(item.Word).toLowerCase().includes(normalizedTerm));
    
    console.log('Search term:', term, 'Results:', results.length);
    
    if(results.length === 0) {
        const noResultsMessage = '<div class="w-full text-center py-12 mt-8"><p class="text-red-600 font-bold text-base">لا توجد الكلمة</p></div>';
        wordList.innerHTML = noResultsMessage;
        mobileWordList.innerHTML = noResultsMessage;
        selectedPageLabel.classList.add('hidden');
        mobileSelectedPageLabel.classList.add('hidden');
        pageList.innerHTML = ''; 
        mobilePageList.innerHTML = '';
        showMobileScreen('words');
        return;
    }
    
    const searchHTML = '<div class="h-2"></div>' + results.map(w => {
        const index = fullData.indexOf(w);
        const hasLook = w.unzur && w.unzur.includes("انظر");
        const lookIcon = hasLook ? '<span class="text-red-600 mr-1">📎</span> ' : '';
        const wordStyle = [
            hasLook ? 'text-red-600 font-bold' : '',
            w.source === 'SH_data' ? 'sh-data-word' : ''
        ].filter(Boolean).join(' ');
        const highlightedWord = highlightMatch(w.Word || '', e.target.value.trim());

        return `
    <button class="word-button${w.source === 'SH_data' ? ' sh-data-button' : ''}" data-index="${index}">
        <span class="${wordStyle}">${lookIcon}${highlightedWord}</span> 
        <span>[س ${w.Line}]</span>
    </button>
`;
    }).join('');

    wordList.innerHTML = searchHTML;
    mobileWordList.innerHTML = searchHTML;

    // 3. Re-attach click listeners so the search results work
    document.querySelectorAll('.word-button').forEach(button => {
        button.addEventListener('click', function() {
            const index = this.dataset.index;
            const item = fullData[index];
            showDetails(item.Word, item.Page, item.Information, item.media, item.links, item.source);
        });
    });

    // 4. Reset scroll to top
    wordSidebar.scrollTop = 0;
    const mobileParent = document.getElementById('mobileWordList').parentElement;
    if(mobileParent) mobileParent.scrollTop = 0;

    selectedPageLabel.classList.add('hidden');
    mobileSelectedPageLabel.classList.add('hidden');
    showMobileScreen('words');
}
// Function to navigate words
function navigateWords(direction) {
    if (currentWordIndex === -1) return;

    const newIndex = currentWordIndex + direction;

    if (newIndex >= 0 && newIndex < fullData.length) {
        const item = fullData[newIndex];
        const currentPage = fullData[currentWordIndex].Page;

        // If the next word is on a different page, refresh the word list sidebar
        if (item.Page !== currentPage) {
            const wordsOnNewPage = fullData.filter(w => w.Page === item.Page);
            displayWords(wordsOnNewPage, item.Page);
        }
        // Scroll the new word button into view
        setTimeout(() => {
            const activeBtn = document.querySelector(`.word-button[data-index="${newIndex}"]`);
            if (activeBtn) {
                activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }, 100);
    
        
        // Show the details
        showDetails(item.Word, item.Page, item.Information, item.media, item.links, item.source);
    }
}

function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    const active = document.body.classList.contains('focus-mode');
    if (focusModeToggle) {
        focusModeToggle.setAttribute('aria-pressed', String(active));
        focusModeToggle.textContent = active ? 'إلغاء التركيز' : 'وضع التركيز';
    }
}

// Attach listeners to the navigation buttons
document.getElementById('prevWord').addEventListener('click', () => navigateWords(-1));
document.getElementById('nextWord').addEventListener('click', () => navigateWords(1));

        // =============================================
        // Feature Pop-up
        // =============================================
        function showFeaturePopup() {
            const popup = document.getElementById('featurePopup');
            popup.style.display = 'block';
        }

        function closeFeaturePopup() {
            const popup = document.getElementById('featurePopup');
            popup.style.display = 'none';
            localStorage.setItem('featurePopupClosed', 'true');
        }

        // Close button listener
        document.getElementById('featurePopupClose').addEventListener('click', closeFeaturePopup);

        // Show popup on page load if not previously closed
        document.addEventListener('DOMContentLoaded', function() {
            const isPopupClosed = localStorage.getItem('featurePopupClosed');
            if (!isPopupClosed) {
                setTimeout(showFeaturePopup, 500);
            }
        });