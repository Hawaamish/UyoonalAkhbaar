// Settings modal: right-hand list of sections, selected section shown on the left.
(function () {
    const modal = document.getElementById('settingsModal');
    const tabs = modal.querySelectorAll('.settings-tab');
    const panels = modal.querySelectorAll('.settings-panel');

    function select(name) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
    }
    function open() {
        const popup = document.getElementById('featurePopup');
        if (popup) popup.style.display = 'none';
        modal.classList.remove('hidden');
    }
    function close() {
        modal.classList.add('hidden');
    }

    tabs.forEach(t => t.addEventListener('click', () => select(t.dataset.tab)));
    document.getElementById('settingsOpen').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        btn.classList.add('is-spinning');
        setTimeout(() => btn.classList.remove('is-spinning'), 600);
        open();
    });
    document.getElementById('settingsClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    // The export dialog opens on top of settings; close settings first.
    document.getElementById('exportPdfOpen').addEventListener('click', close);

    document.querySelectorAll('input[name="dataSourceMode"]').forEach(r => {
        r.checked = r.value === 'hamish';
        r.addEventListener('change', () => { if (r.checked) setDataSourceMode(r.value); });
    });

    select('appearance');
})();
