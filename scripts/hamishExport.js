// PDF export: renders A4 portrait RTL tables (page, line, word, information) from fullData.
(function () {
    const PAGE_W = 794;
    const PAGE_H = 1123;
    const PAD = 38;
    const PASTELS = ['#fde2e4', '#e2ece9', '#dfe7fd', '#fff1c1', '#e8dff5', '#d6eadf', '#fad2e1', '#cddafd', '#ffe5d0', '#d0f0f0'];
    const HEAD_BG = '#eceff4';

    const $ = (id) => document.getElementById(id);
    const modal = $('exportPdfModal');
    const status = $('exportPdfStatus');
    const goBtn = $('exportPdfGo');
    let busy = false;
    let done = false;
    const bar = $('exportPdfProgress');
    const barWrap = $('exportPdfProgressWrap');

    function setProgress(pct) {
        barWrap.classList.remove('hidden');
        bar.style.width = Math.round(pct) + '%';
    }
    function resetUi() {
        done = false;
        status.textContent = '';
        bar.style.width = '0%';
        barWrap.classList.add('hidden');
        goBtn.textContent = 'تصدير';
        goBtn.classList.remove('bg-green-800', 'hover:bg-green-900');
        goBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    }

    function openModal() {
        resetUi();
        modal.classList.remove('hidden');
    }
    function closeModal() {
        if (busy) return;
        modal.classList.add('hidden');
    }
    function syncMode() {
        const range = document.querySelector('input[name="exportPdfMode"]:checked').value === 'range';
        $('exportPdfFrom').disabled = !range;
        $('exportPdfTo').disabled = !range;
        $('exportPdfRange').classList.toggle('opacity-50', !range);
    }

    function selectRows() {
        const sorted = fullData.slice().sort((a, b) =>
            compareMixed(a.Page, b.Page) || compareMixed(a.Line, b.Line));
        const mode = document.querySelector('input[name="exportPdfMode"]:checked').value;
        if (mode === 'all') return sorted;
        const from = Number($('exportPdfFrom').value.trim());
        const to = Number($('exportPdfTo').value.trim());
        if (!Number.isFinite(from) || !Number.isFinite(to) || $('exportPdfFrom').value.trim() === '' || $('exportPdfTo').value.trim() === '') {
            throw new Error('الرجاء إدخال رقمي الصفحة (من / إلى)');
        }
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        return sorted.filter(r => r.Page !== '' && Number.isFinite(Number(r.Page)) && Number(r.Page) >= lo && Number(r.Page) <= hi);
    }

    function decodeEntities(value) {
        const t = document.createElement('textarea');
        t.innerHTML = value;
        return t.value;
    }

    // Text between "}}" and "{{" gets the Kanz font (mirrors the page).
    function kanzMarkers(html) {
        if (!/\}\}|\{\{/.test(html)) return html;
        let active = false;
        return html.split(/(<[^>]*>)/).map(part => {
            if (part.startsWith('<') && part.endsWith('>')) return part;
            return part.split(/(\}\}|\{\{)/).map(seg => {
                if (seg === '}}' || seg === '{{') { active = !active; return ''; }
                return active && seg.trim() ? `<span class="kanz-text">${seg}</span>` : seg;
            }).join('');
        }).join('');
    }

    function enhance(raw) {
        const html = kanzMarkers(decodeEntities(raw || '')).replace(/\*\*\*/g, '<hr>');
        return html.replace(/(^|\s)(رض|ع م|صلع|ص ع|تع|قس)(?=\s|$)/g, '$1<sup>$2</sup>');
    }

    function infoHtml(raw) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = enhance(raw);
        wrapper.querySelectorAll('img, script, video, audio, iframe').forEach(n => n.remove());
        wrapper.querySelectorAll('hr').forEach(n => { n.style.cssText = 'border:0;border-top:1px solid #ddd;margin:6px 0'; });
        return wrapper.innerHTML;
    }

    const CSS = `
        .pdf-page{width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;padding:${PAD}px;background:#fff;direction:rtl;overflow:hidden;
            font-family:'Amiri',serif;font-size:21.333px;line-height:2.1;color:#222}
        .pdf-page table{width:100%;border-collapse:collapse;table-layout:fixed;direction:rtl}
        .pdf-page th,.pdf-page td{border:1px solid #c9ced6;padding:10px 10px 14px;vertical-align:top;text-align:right;font-size:21.333px;line-height:2.1;word-wrap:break-word;overflow-wrap:anywhere;overflow:visible}
        .pdf-page th{background:${HEAD_BG};font-weight:700;white-space:nowrap;text-align:center;padding:8px 4px 12px;font-size:19px}
        .pdf-page td.info{background:#fff}
        .pdf-page td.num{text-align:center;font-weight:700}
        .pdf-page td.word{font-weight:700}
        .pdf-page .kanz-text{font-family:'Kanz Al Marjaan','Amiri',serif}
        .pdf-page p{margin:0 0 4px;line-height:2.1}
        .pdf-page sup{font-size:70%}`;

    function newPage(host) {
        const page = document.createElement('div');
        page.className = 'pdf-page';
        const table = document.createElement('table');
        table.innerHTML = `<colgroup><col style="width:12%"><col style="width:9%"><col style="width:22%"><col style="width:57%"></colgroup>
            <thead><tr><th>الصفحة</th><th>السطر</th><th>الكلمة</th><th>الهامش</th></tr></thead><tbody></tbody>`;
        page.appendChild(table);
        host.appendChild(page);
        return { page, body: table.tBodies[0] };
    }

    function buildPages(host, rows) {
        const colorOf = new Map();
        const pages = [];
        let cur = newPage(host);
        pages.push(cur.page);
        for (const r of rows) {
            if (!colorOf.has(r.Page)) colorOf.set(r.Page, PASTELS[colorOf.size % PASTELS.length]);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="num" style="background:${colorOf.get(r.Page)}"></td><td class="num"></td><td class="word"></td><td class="info"></td>`;
            tr.cells[0].textContent = r.Page;
            tr.cells[1].textContent = r.Line;
            tr.cells[2].textContent = r.Word;
            tr.cells[3].innerHTML = infoHtml(r.Information);
            cur.body.appendChild(tr);
            if (cur.page.scrollHeight > PAGE_H + 1 && cur.body.rows.length > 1) {
                cur.body.removeChild(tr);
                cur = newPage(host);
                pages.push(cur.page);
                cur.body.appendChild(tr);
            }
        }
        return pages;
    }

    async function pickFileHandle(name) {
        if (!window.showSaveFilePicker) return null;
        return window.showSaveFilePicker({
            suggestedName: name,
            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
        });
    }

    async function doExport() {
        if (done) { closeModal(); return; }
        if (busy) return;
        if (!window.html2canvas || !window.jspdf) {
            status.textContent = 'مكتبة PDF غير متاحة (تحقق من الاتصال بالإنترنت).';
            return;
        }
        let rows;
        try {
            if (!fullData.length) throw new Error('لم يتم تحميل البيانات بعد');
            rows = selectRows();
            if (!rows.length) throw new Error('لا توجد بيانات في هذا النطاق');
        } catch (e) {
            status.textContent = e.message;
            return;
        }

        const fileName = `هامش الصفحات من ${rows[0].Page} الى ${rows[rows.length - 1].Page}.pdf`;
        let handle = null;
        try {
            handle = await pickFileHandle(fileName);
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }

        busy = true;
        goBtn.disabled = true;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-10000px;top:0;';
        const style = document.createElement('style');
        style.textContent = CSS;
        host.appendChild(style);
        document.body.appendChild(host);

        try {
            status.textContent = 'جارٍ تحميل الخطوط...';
            setProgress(2);
            await Promise.all([
                document.fonts.load("21px 'Amiri'"),
                document.fonts.load("bold 21px 'Amiri'"),
                document.fonts.load("21px 'Kanz Al Marjaan'")
            ]).catch(() => {});
            await document.fonts.ready;

            const pages = buildPages(host, rows);
            setProgress(8);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();

            for (let i = 0; i < pages.length; i++) {
                status.textContent = `جارٍ إنشاء الصفحة ${i + 1} من ${pages.length}...`;
                await new Promise(r => setTimeout(r));
                const canvas = await html2canvas(pages[i], {
                    scale: 2, backgroundColor: '#ffffff', useCORS: true, width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W
                });
                if (i > 0) pdf.addPage('a4', 'portrait');
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
                canvas.width = canvas.height = 0;
                setProgress(8 + 87 * (i + 1) / pages.length);
            }

            const blob = pdf.output('blob');
            if (handle) {
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            }
            setProgress(100);
            status.textContent = 'تم التصدير بنجاح';
            done = true;
            goBtn.textContent = 'تم بنجاح ✓';
            goBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            goBtn.classList.add('bg-green-800', 'hover:bg-green-900');
        } catch (e) {
            console.error(e);
            status.textContent = 'تعذر التصدير: ' + (e && e.message ? e.message : e);
        } finally {
            host.remove();
            busy = false;
            goBtn.disabled = false;
        }
    }

    $('exportPdfOpen').addEventListener('click', openModal);
    $('exportPdfClose').addEventListener('click', closeModal);
    $('exportPdfCancel').addEventListener('click', closeModal);
    goBtn.addEventListener('click', doExport);
    document.querySelectorAll('input[name="exportPdfMode"]').forEach(r => r.addEventListener('change', syncMode));
    syncMode();
})();
