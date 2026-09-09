// Extracted from maps.html. Existing section comments describe the page's behavior.

const grid = document.getElementById('mainGrid');
const lightbox = document.getElementById('lightbox');
const closeBtn = document.getElementById('lightboxClose');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// 1. Gather all local image paths from your folder
const images = [];
grid.querySelectorAll('.post-card img').forEach(img => {
    images.push(img.getAttribute('src')); 
});

let currentImageIndex = 0;
let viewer = null;

// 2. Initialize OpenSeadragon with High Zoom for local files
function updateViewer(index) {
    currentImageIndex = index;
    const localPath = images[currentImageIndex];

    if (viewer) {
        viewer.open({
            type: 'image',
            url: localPath
        });
    } else {
        viewer = OpenSeadragon({
            id: "openseadragon-container",
            prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/",
            tileSources: {
                type: 'image',
                url: localPath
            },
            // Settings for extra deep zoom
            maxZoomLevel: 12, 
            defaultZoomLevel: 0,
            minZoomLevel: 0.5,
            gestureSettingsMouse: { clickToZoom: true, dblClickToZoom: true },
            showNavigationControl: false // Using our custom buttons instead
        });
    }
}

// 3. Event Listeners for Opening/Navigating
grid.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        lightbox.style.display = 'flex';
        updateViewer(index);
        document.body.style.overflow = 'hidden'; 
    });
});

nextBtn.addEventListener('click', (e) => { e.stopPropagation(); showNext(); });
prevBtn.addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });

function showNext() {
    currentImageIndex = (currentImageIndex + 1) % images.length;
    updateViewer(currentImageIndex);
}

function showPrev() {
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    updateViewer(currentImageIndex);
}

function closeLightbox() {
    lightbox.style.display = 'none';
    document.body.style.overflow = 'auto';
}

closeBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

        closeBtn.addEventListener('click', closeLightbox);
        
        // Close on background click (detect if the click was directly on the lightbox overlay)
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });

        // Keyboard navigation (Esc to close, Arrows for prev/next)
        document.addEventListener('keydown', (e) => {
            if (lightbox.style.display === 'flex') {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowRight') showPrev(); // RTL logical map
                if (e.key === 'ArrowLeft') showNext(); // RTL logical map
            }
        });
