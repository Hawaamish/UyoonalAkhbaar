// Extracted from bookindex.html. Existing section comments describe the page's behavior.

let bookData = [];
    const csvTableName = 'U2_FehristDatabaseView1';

    const categories = [
        { name: "الايات الكريمة", color: "#FFD1DC" },
        { name: "الاحاديث", color: "#E0BBE4" },
        { name: "الاكاليم", color: "#957DAD" },
        { name: "الاعلام", color: "#D291BC" },
        { name: "الاماكن", color: "#FEC8D8" },
        { name: "القبائل", color: "#FFDFD3" },
        { name: "الحيوانات", color: "#B5EAD7" },
        { name: "الاشعار", color: "#C7CEEA" },
        { name: "الكتب", color: "#E2F0CB" },
        { name: "الامثال", color: "#F7E1AD" }
    ];

    function convertToArabicNumbers(str) {
        const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return str.replace(/[0-9]/g, function(w) {
            return arabicNumbers[+w];
        });
    }

    function loadCSV() {
        fetchTableAsCsv(csvTableName).then(function(text) {
          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                bookData = results.data;
                document.getElementById('loader').style.display = 'none';
                document.getElementById('pie-menu').style.display = window.innerWidth >= 800 ? 'block' : 'grid';
                initMenu();
                
                // Small delay to ensure the DOM is fully ready before hash-based navigation
                setTimeout(() => {
                    const hash = decodeURIComponent(window.location.hash.substring(1));
                    if (hash && categories.some(cat => cat.name === hash)) {
                        // Replace initial state with the pie menu, then push the category
                        history.replaceState({ category: null }, "", window.location.pathname);
                        showCategory(hash, 'push');
                    }
                }, 100);
            },
            error: function() {
                document.getElementById('loader').innerText = "خطأ في تحميل البيانات";
            }
          });
        }).catch(function() {
            document.getElementById('loader').innerText = "خطأ في تحميل البيانات";
        });
    }

    let lastWidth = window.innerWidth;
    let resizeTimer;
    
    function initMenu() {
        const currentWidth = window.innerWidth;
        const menu = document.getElementById('pie-menu');
        if (!menu) return;

        // Only re-render if the width has changed (to avoid unnecessary clears)
        // or if the menu is empty.
        if (currentWidth === lastWidth && menu.innerHTML !== '') return;
        lastWidth = currentWidth;

        menu.innerHTML = '';
        const isDesktop = currentWidth >= 800;
        const radius = 240; 

        categories.forEach((cat, i) => {
            const div = document.createElement('div');
            div.className = 'pie-item';
            div.innerText = cat.name;
            div.style.backgroundColor = cat.color;
            
            if (isDesktop) {
                const angle = (i / categories.length) * (Math.PI * 2);
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                div.style.left = `calc(50% + ${x}px)`;
                div.style.top = `calc(50% + ${y}px)`;
            }
            
            // Single event listener for both touch and click
            const selectCategory = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showCategory(cat.name);
            };
            
            // Use pointerdown for the most immediate response
            div.addEventListener('pointerdown', selectCategory);
            
            menu.appendChild(div);
        });
    }

    function handleResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            initMenu();
        }, 200);
    }

    function showCategory(name, historyAction = 'push') {
        const introView = document.getElementById('intro-view');
        const tableView = document.getElementById('table-view');
        
        if (!introView || !tableView) return;

        introView.style.display = 'none';
        tableView.style.display = 'block';
        document.getElementById('current-category').innerText = name;

        // Manage history
        try {
            if (historyAction === 'push') {
                history.pushState({ category: name }, "", "#" + encodeURIComponent(name));
            } else if (historyAction === 'replace') {
                history.replaceState({ category: name }, "", "#" + encodeURIComponent(name));
            }
        } catch (e) {
            console.error("History API error:", e);
        }

        const tbody = document.getElementById('data-rows');
        if (tbody) {
            tbody.innerHTML = '';

            const filtered = bookData.filter(row => row['الصنف'] === name);

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:30px;">لا توجد بيانات</td></tr>';
            } else {
                filtered.forEach(row => {
                    const tr = document.createElement('tr');
                    const arabicPageLine = convertToArabicNumbers(row['الصحفة السطر'] || '');
                    tr.innerHTML = `
                        <td class="col-text">${row['النص']}</td>
                        <td class="col-page">${arabicPageLine}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }
        window.scrollTo(0,0);
    }
    window.showCategory = showCategory; // Ensure global access for popstate or other triggers

    function goBack() {
        if (history.state && history.state.category) {
            history.back();
        } else {
            // Fallback for cases where history wasn't pushed correctly
            document.getElementById('table-view').style.display = 'none';
            document.getElementById('intro-view').style.display = 'block';
            history.replaceState(null, "", window.location.pathname);
            initMenu(); // Ensure menu is ready when going back
        }
    }

    // Handle browser back button (mobile and desktop)
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.category) {
            // If there's a category in the state, show it
            showCategory(event.state.category, 'none');
        } else {
            // If no category (initial state), show the pie menu
            document.getElementById('table-view').style.display = 'none';
            document.getElementById('intro-view').style.display = 'block';
            initMenu(); // Ensure menu is ready when going back
        }
    });

    // Use debounced resize listener
    window.addEventListener('resize', handleResize);
    window.onload = loadCSV;
