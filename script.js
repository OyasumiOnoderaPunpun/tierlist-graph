document.addEventListener('DOMContentLoaded', async () => {
    // State
    let images = [];
    let state = { positions: {}, changelog: [] };
    let isAdmin = false;
    
    // Supabase Configuration
    const SUPABASE_URL = 'https://gabkeulhfitcpdzruukb.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_w_h6ta5ryTIdGw0_vTCaDA_x96eGJlu';
    
    const supabase = (SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co') 
        ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;

    // Viewport & Pan/Zoom State
    let panX = 100;
    let panY = window.innerHeight - 200; // Bottom-leftish origin
    let zoom = 1;
    const pxPerUnit = 50; // 50 pixels per 1 coordinate unit
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;
    let highlightedItem = null;

    // DOM Elements
    const imageTray = document.getElementById('image-tray');
    const viewport = document.getElementById('viewport');
    const graphPlane = document.getElementById('graph-plane');
    const pathOverlay = document.getElementById('path-overlay');
    const axisNumbersContainer = document.getElementById('axis-numbers');
    const searchInput = document.getElementById('search-input');
    const checkboxes = document.querySelectorAll('.checkbox-filters input');
    const adminTrayContainer = document.getElementById('admin-tray-container');
    
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetViewBtn = document.getElementById('reset-view');
    const originBtn = document.getElementById('origin-btn');

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const saveBtn = document.getElementById('save-btn');
    const settingsBtn = document.getElementById('settings-btn');
    
    const loginModal = document.getElementById('login-modal');
    const closeLoginBtn = document.querySelector('.close-login-btn');
    const submitLoginBtn = document.getElementById('submit-login-btn');
    const adminPassword = document.getElementById('admin-password');

    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.querySelector('.close-settings-btn');
    const themeCards = document.querySelectorAll('.theme-card');

    const changelogModal = document.getElementById('changelog-modal');
    const viewChangelogBtn = document.getElementById('view-changelog-btn');
    const closeChangelogBtn = document.querySelector('.close-btn');
    const changelogList = document.getElementById('changelog-list');
    const adminChangelogControls = document.getElementById('admin-changelog-controls');
    const addChangelogBtn = document.getElementById('add-changelog-btn');
    const newChangelogText = document.getElementById('new-changelog-text');

    // Fetch Data
    async function loadData() {
        try {
            // Load saved theme
            const savedTheme = localStorage.getItem('tierlist_theme') || 'default';
            applyTheme(savedTheme);

            // Fetch static image roster
            const imgRes = await fetch('images.json');
            images = await imgRes.json();

            // Fetch data from Supabase
            if (supabase) {
                const { data, error } = await supabase
                    .from('tierlist_data')
                    .select('content')
                    .eq('id', 'main')
                    .single();
                
                if (data) {
                    state = data.content;
                } else if (error) {
                    console.error("Supabase error:", error);
                }
            } else {
                console.warn("Supabase not configured. Loading empty state.");
            }
            
            if(!state.positions) state.positions = {};
            if(!state.changelog) state.changelog = [];
            
            updateTransform();
            render();
        } catch (error) {
            console.error("Failed to load data:", error);
        }
    }

    // Theme Logic
    function applyTheme(themeName) {
        document.body.dataset.theme = themeName;
        localStorage.setItem('tierlist_theme', themeName);
        
        // Update active class on cards
        themeCards.forEach(card => {
            if (card.dataset.theme === themeName) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    // Pan / Zoom Engine
    function updateTransform() {
        graphPlane.style.setProperty('--pan-x', `${panX}px`);
        graphPlane.style.setProperty('--pan-y', `${panY}px`);
        graphPlane.style.setProperty('--zoom', zoom);
        
        // Pin labels to axes but clamp within viewport
        const rect = viewport.getBoundingClientRect();
        const padding = 60;

        // Y Axis Label (VALUE) follows Y axis line (panX)
        let labelYX = panX;
        labelYX = Math.max(padding, Math.min(rect.width - padding, labelYX));
        viewport.style.setProperty('--label-y-x', `${labelYX}px`);
        viewport.style.setProperty('--label-y-y', `50%`); // Keep centered vertically

        // X Axis Label (PVP) follows X axis line (panY)
        let labelXY = panY;
        labelXY = Math.max(padding, Math.min(rect.height - padding, labelXY));
        viewport.style.setProperty('--label-x-y', `${labelXY}px`);
        viewport.style.setProperty('--label-x-x', `50%`); // Keep centered horizontally

        drawAxes();
    }

    viewport.addEventListener('mousedown', (e) => {
        // If clicking on a plotted item, don't pan
        if (e.target.closest('.plotted-item')) return;
        isPanning = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomAmount = 0.1;
        const oldZoom = zoom;
        if (e.deltaY < 0) zoom += zoomAmount;
        else zoom -= zoomAmount;
        
        zoom = Math.max(0.2, Math.min(zoom, 5)); // restrict zoom limits
        
        // Zoom toward cursor
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate offset difference
        panX = mouseX - (mouseX - panX) * (zoom / oldZoom);
        panY = mouseY - (mouseY - panY) * (zoom / oldZoom);
        
        updateTransform();
    }, { passive: false });

    zoomInBtn.addEventListener('click', () => {
        zoom = Math.min(5, zoom + 0.2);
        updateTransform();
    });
    zoomOutBtn.addEventListener('click', () => {
        zoom = Math.max(0.2, zoom - 0.2);
        updateTransform();
    });
    resetViewBtn.addEventListener('click', () => {
        zoom = 1;
        panX = 100;
        panY = viewport.clientHeight - 200;
        updateTransform();
    });
    originBtn.addEventListener('click', () => {
        zoom = 1;
        panX = 100;
        panY = viewport.clientHeight - 200;
        updateTransform();
    });

    // Draw dynamic axes numbers
    function drawAxes() {
        axisNumbersContainer.innerHTML = '';
        const rect = viewport.getBoundingClientRect();
        
        // Target visual gap between numbers: ~100 pixels
        const targetGapPx = 100;
        const logicalGap = targetGapPx / (zoom * pxPerUnit);
        
        // Snap logicalGap to nearest nice number (1, 2, 5, 10, 0.5, 0.1 etc)
        const magnitude = Math.pow(10, Math.floor(Math.log10(logicalGap)));
        const normalized = logicalGap / magnitude;
        
        let step;
        if (normalized < 1.5) step = 1 * magnitude;
        else if (normalized < 3.5) step = 2 * magnitude;
        else if (normalized < 7.5) step = 5 * magnitude;
        else step = 10 * magnitude;
        
        // Update grid background size to match the step
        const gridPx = step * pxPerUnit;
        const gridBg = document.getElementById('grid-background');
        if (gridBg) {
            gridBg.style.backgroundSize = `${gridPx}px ${gridPx}px`;
        }

        // Calculate visible coordinate bounds based on step
        const startX = Math.floor((-panX / zoom) / pxPerUnit / step) * step;
        const endX = Math.ceil(((rect.width - panX) / zoom) / pxPerUnit / step) * step;
        
        const yMax = Math.ceil((panY / zoom) / pxPerUnit / step) * step;
        const yMin = Math.floor(((panY - rect.height) / zoom) / pxPerUnit / step) * step;

        // X numbers (along y=0 line)
        for (let x = startX; x <= endX; x += step) {
            const cleanX = Math.round(x * 1000) / 1000;
            if (cleanX === 0 || cleanX < 0) continue;
            const el = document.createElement('div');
            el.className = 'axis-number x-num';
            el.textContent = cleanX;
            el.style.left = `${cleanX * pxPerUnit}px`;
            axisNumbersContainer.appendChild(el);
        }

        // Y numbers (along x=0 line)
        for (let y = yMin; y <= yMax; y += step) {
            const cleanY = Math.round(y * 1000) / 1000;
            if (cleanY === 0 || cleanY < 0) continue;
            const el = document.createElement('div');
            el.className = 'axis-number y-num';
            el.textContent = cleanY;
            el.style.top = `${-cleanY * pxPerUnit}px`;
            axisNumbersContainer.appendChild(el);
        }
    }

    // Render Everything
    function render() {
        renderTray();
        renderGraph();
        renderChangelog();
        updateAdminUI();
        drawPath();
    }

    // Render Tray
    function renderTray() {
        imageTray.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        const activeCategories = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value.toLowerCase());

        // Sort images by category then name
        const sortedImages = [...images].sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.name.localeCompare(b.name);
        });

        let currentCategory = null;

        sortedImages.forEach(img => {
            const isPlotted = state.positions[img.id] !== undefined;
            if (!activeCategories.includes(img.category.toLowerCase())) return;
            if (searchTerm && !img.name.toLowerCase().includes(searchTerm)) return;

            // Add category header if category changes
            if (currentCategory !== img.category) {
                currentCategory = img.category;
                const header = document.createElement('div');
                header.className = 'tray-category-header';
                header.textContent = currentCategory.toUpperCase();
                imageTray.appendChild(header);
            }

            const el = document.createElement('div');
            el.className = 'tray-item';
            if (isPlotted) el.classList.add('plotted-in-tray');
            if (isAdmin && !isPlotted) el.draggable = true;
            
            el.dataset.id = img.id;
            
            el.innerHTML = `
                <img src="${img.url}" alt="${img.name}" style="${isPlotted ? 'opacity: 0.3' : ''}">
                <div class="item-name" style="${isPlotted ? 'color: var(--accent-color)' : ''}">${img.name}</div>
            `;
            
            if (!isPlotted) {
                el.addEventListener('dragstart', handleDragStart);
            } else {
                // Click to Locate
                el.addEventListener('click', () => locateItem(img.id));
                el.style.cursor = 'pointer';
            }
            
            imageTray.appendChild(el);
        });
    }

    // Render Graph
    function renderGraph() {
        // Clear existing plotted items but keep axes
        const existing = graphPlane.querySelectorAll('.plotted-item');
        existing.forEach(el => el.remove());

        const activeCategories = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value.toLowerCase());

        const showAll = activeCategories.length === 0;

        images.forEach(img => {
            const pos = state.positions[img.id];
            if (!pos) return;

            // Filter logic
            if (!showAll && !activeCategories.includes(img.category.toLowerCase())) return;

            const el = document.createElement('div');
            el.className = 'plotted-item';
            if (highlightedItem === img.id) el.classList.add('highlighted');
            
            el.draggable = isAdmin;
            el.dataset.id = img.id;
            
            // Apply category color
            const catColor = getComputedStyle(document.body).getPropertyValue(`--cat-${img.category.toLowerCase()}`);
            el.style.setProperty('--category-color', catColor);

            // Map coordinate (x, y) to css (left, top). Y goes UP, so negative top.
            el.style.left = `${pos.x * pxPerUnit}px`;
            el.style.top = `${-pos.y * pxPerUnit}px`;
            
            el.innerHTML = `
                <img src="${img.url}" alt="${img.name}">
                <div class="tooltip">
                    ${img.name}
                    <div class="score">Score: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})</div>
                </div>
            `;
            
            el.addEventListener('dragstart', handleDragStart);
            // double click to remove
            if (isAdmin) {
                el.addEventListener('dblclick', () => {
                    delete state.positions[img.id];
                    render();
                });
            }
            
            graphPlane.appendChild(el);
        });
    }

    // Locate and Zoom to item
    function locateItem(id) {
        const pos = state.positions[id];
        if (!pos) return;
        
        // Calculate target plane coordinates
        const targetLeft = pos.x * pxPerUnit;
        const targetTop = -pos.y * pxPerUnit;
        
        // Set zoom nicely
        zoom = 1.5;
        
        // Center the viewport on the item
        const rect = viewport.getBoundingClientRect();
        panX = (rect.width / 2) - (targetLeft * zoom);
        panY = (rect.height / 2) - (targetTop * zoom);
        
        highlightedItem = id;
        
        updateTransform();
        render(); // Renders the highlight
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
            if (highlightedItem === id) {
                highlightedItem = null;
                render();
            }
        }, 3000);
    }

    // Draw connecting path for focused category
    function drawPath() {
        pathOverlay.innerHTML = '';
        const activeCategories = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value.toLowerCase());

        const categoriesToDraw = activeCategories.length === 0 ? 
            [...new Set(images.map(img => img.category.toLowerCase()))] : 
            activeCategories;

        categoriesToDraw.forEach((category, catIndex) => {
            const itemsToConnect = images.filter(img => 
                img.category.toLowerCase() === category && 
                state.positions[img.id]
            );

            if (itemsToConnect.length < 2) return;

            // Sort items by PVP Score (X-axis) for a more "graph-like" left-to-right flow
            itemsToConnect.sort((a, b) => state.positions[a.id].x - state.positions[b.id].x);

            const color = getComputedStyle(document.body).getPropertyValue(`--cat-${category}`);
            
            // Add a small vertical offset per category so they don't perfectly overlap
            const categoryOffset = (catIndex - (categoriesToDraw.length / 2)) * 4;

            let d = '';
            itemsToConnect.forEach((img, i) => {
                const pos = state.positions[img.id];
                const pxX = pos.x * pxPerUnit + 100000;
                const pxY = -pos.y * pxPerUnit + 100000 + categoryOffset;
                
                if (i === 0) d += `M ${pxX} ${pxY} `;
                else d += `L ${pxX} ${pxY} `;
            });

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("class", "category-path");
            path.style.stroke = color;
            path.style.color = color;
            pathOverlay.appendChild(path);
        });
    }

    // Render Changelog
    function renderChangelog() {
        changelogList.innerHTML = '';
        const sorted = [...state.changelog].sort((a, b) => new Date(b.date) - new Date(a.date));
        sorted.forEach(entry => {
            const el = document.createElement('div');
            el.className = 'changelog-entry';
            const d = new Date(entry.date);
            el.innerHTML = `
                <div class="changelog-date">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</div>
                <div class="changelog-text">${entry.text}</div>
            `;
            changelogList.appendChild(el);
        });
    }

    function updateAdminUI() {
        if (isAdmin) {
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            saveBtn.classList.remove('hidden');
            adminChangelogControls.classList.remove('hidden');
            adminTrayContainer.classList.remove('hidden');
        } else {
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
            saveBtn.classList.add('hidden');
            adminChangelogControls.classList.add('hidden');
            adminTrayContainer.classList.add('hidden');
        }
    }

    // Drag and Drop Logic
    function handleDragStart(e) {
        if (!isAdmin) return;
        const id = e.target.closest('.tray-item, .plotted-item').dataset.id;
        e.dataTransfer.setData('text/plain', id);
        
        // Store click offset within the element so drop is accurate
        const rect = e.target.getBoundingClientRect();
        e.dataTransfer.setData('offsetX', (e.clientX - rect.left) / zoom);
        e.dataTransfer.setData('offsetY', (e.clientY - rect.top) / zoom);
    }

    viewport.addEventListener('dragover', e => {
        if (!isAdmin) return;
        e.preventDefault(); // allow drop
    });

    viewport.addEventListener('drop', e => {
        if (!isAdmin) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        const offsetX = parseFloat(e.dataTransfer.getData('offsetX')) || 40;
        const offsetY = parseFloat(e.dataTransfer.getData('offsetY')) || 40;

        const rect = viewport.getBoundingClientRect();
        
        // Mouse coordinate relative to viewport
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Map to plane coordinate
        const planeX = (mouseX - panX) / zoom;
        const planeY = (mouseY - panY) / zoom;
        
        // Adjust by offset so element drops exactly where grabbed
        // And adjust for the center transform (-50%, -50%) of plotted item
        const adjustedX = planeX + (30 - offsetX); // 30 is half of 60px width
        const adjustedY = planeY + (30 - offsetY);

        // Map to logical coordinate
        let x = adjustedX / pxPerUnit;
        let y = -adjustedY / pxPerUnit;
        
        // Round to 1 decimal place for neatness, restrict to positive if desired (currently allowing negative but usually games are positive)
        x = Math.max(0, Math.round(x * 10) / 10);
        y = Math.max(0, Math.round(y * 10) / 10);

        state.positions[id] = { x, y };
        render();
    });

    // Event Listeners
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        // If there's an exact or close match among plotted items, we can optionally auto-zoom.
        // But user request said "when searching for something using the search bar the graph zooming onto that specific placement".
        // Let's find the first plotted match and zoom to it automatically.
        if (searchTerm.length >= 3) {
            const match = images.find(img => img.name.toLowerCase().includes(searchTerm) && state.positions[img.id]);
            if (match && highlightedItem !== match.id) {
                locateItem(match.id);
            }
        }
        renderTray();
    });
    
    checkboxes.forEach(cb => cb.addEventListener('change', render));

    // Modals
    loginBtn.addEventListener('click', () => loginModal.classList.remove('hidden'));
    closeLoginBtn.addEventListener('click', () => loginModal.classList.add('hidden'));
    
    viewChangelogBtn.addEventListener('click', () => changelogModal.classList.remove('hidden'));
    closeChangelogBtn.addEventListener('click', () => changelogModal.classList.add('hidden'));

    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

    // Theme Selection
    themeCards.forEach(card => {
        card.addEventListener('click', () => {
            const theme = card.dataset.theme;
            applyTheme(theme);
        });
    });

    // Admin Login
    submitLoginBtn.addEventListener('click', () => {
        const pw = adminPassword.value;
        if (pw === 'admin123') { 
            isAdmin = true;
            authHeader = pw;
            loginModal.classList.add('hidden');
            adminPassword.value = '';
            render();
            alert('Logged in as Admin.');
        } else {
            alert('Incorrect password');
        }
    });

    logoutBtn.addEventListener('click', () => {
        isAdmin = false;
        authHeader = '';
        render();
    });

    // Save Changes
    saveBtn.addEventListener('click', async () => {
        if (!isAdmin || !supabase) return;
        saveBtn.textContent = 'Saving...';
        try {
            const { error } = await supabase
                .from('tierlist_data')
                .upsert({ id: 'main', content: state });

            if (!error) {
                alert('Changes saved to Supabase successfully!');
            } else {
                console.error(error);
                alert('Failed to save changes: ' + error.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error saving changes.');
        }
        saveBtn.textContent = 'Save Changes';
    });

    // Add Changelog
    addChangelogBtn.addEventListener('click', () => {
        const text = newChangelogText.value.trim();
        if (!text) return;
        
        state.changelog.push({
            date: new Date().toISOString(),
            text: text
        });
        newChangelogText.value = '';
        renderChangelog();
    });

    // Initialize
    loadData();
});
