// Editor-specific JavaScript functionality

let currentProject = null;
let isPlaying = false;
let currentTime = 0;
let duration = 60; // Default 60s
let autoSaveInterval = null;
let videoElement = null;

// Toast Notification System
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; top: 2rem; right: 2rem; z-index: 10000; display: flex; flex-direction: column; gap: 0.5rem;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const color = type === 'success' ? 'rgba(74, 222, 128, 0.9)' :
        type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(59, 130, 246, 0.9)';

    toast.style.cssText = `
        background: ${color};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.9rem;
        font-weight: 600;
        backdrop-filter: blur(10px);
        transform: translateX(400px);
        transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.4s ease;
        opacity: 0;
    `;

    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}" size="18"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// Initialize editor
function initEditor() {
    // Auth Guard
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = '/login';
        return;
    }

    // Load Project
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    if (projectId) {
        loadProject(projectId);
    }

    setupPlaybackControls();
    setupElementInteractions();
    setupEffectInteractions();
    setupKeyboardShortcuts();
    setupTranslateFeature();
    setupTabs();
    setupAIButtons();
    checkAutoOpenTranslate();

    // Auto-save every 30 seconds
    autoSaveInterval = setInterval(() => {
        if (currentProject) saveProject(true);
    }, 30000);
}

// Project Loading
async function loadProject(id) {
    try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error('Project not found');

        currentProject = await res.json();

        document.getElementById('projectTitle').textContent = currentProject.name;
        document.getElementById('previewTitle').textContent = currentProject.name;

        // Initialize scripts from saved content or defaults
        initializeScriptSections(currentProject.content.scripts || currentProject.name);
        initializeTimeline(currentProject.content.timeline);

        // Initialize Canvas or Video
        if (currentProject.type === 'video' || currentProject.content.videoUrl) {
            setupVideoPlayer(currentProject.content.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        }

        initializeCanvas(currentProject.content.elements);
    } catch (err) {
        console.error('Failed to load project', err);
        showToast('Failed to load project', 'error');
    }
}

function setupVideoPlayer(url) {
    const container = document.querySelector('.video-preview');
    // Keep sidebar overlays (canvas elements) but replace placeholder
    const placeholder = container.querySelector('.preview-placeholder');
    if (placeholder) {
        // Create video element
        videoElement = document.createElement('video');
        videoElement.src = url;
        videoElement.style.cssText = 'width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; z-index: 0;';
        videoElement.crossOrigin = "anonymous";

        // Insert before placeholder content (so overlays stay on top)
        container.insertBefore(videoElement, placeholder);

        // Hide placeholder bg but keep it as container for elements? 
        // Actually, elements are inside .preview-placeholder usually.
        // Let's make .preview-placeholder transparent and on top
        placeholder.style.background = 'transparent';
        placeholder.style.zIndex = '10'; // Ensure elements are above video

        // Hide only the iconic text content, keep canvas elements
        const iconContent = placeholder.querySelector('.placeholder-content');
        if (iconContent) iconContent.style.display = 'none';

        // Video Events
        videoElement.addEventListener('loadedmetadata', () => {
            duration = videoElement.duration;
            updateTimeDisplay();
        });

        videoElement.addEventListener('timeupdate', () => {
            if (!isPlaying && !videoElement.paused) isPlaying = true; // Sync state
            currentTime = videoElement.currentTime;
            updateTimeDisplay();
            updateTimelineCursor();
        });

        videoElement.addEventListener('ended', () => {
            isPlaying = false;
            const playBtn = document.querySelector('.play-btn');
            if (playBtn) playBtn.innerHTML = '<i data-lucide="play"></i>';
            lucide.createIcons();
        });
    }
}

function initializeScriptSections(data) {
    const container = document.getElementById('scriptSections');
    container.innerHTML = '';

    let sections = [];

    if (Array.isArray(data)) {
        sections = data;
    } else {
        // Default sections if no saved data
        const projectName = data || 'Untitled';
        sections = [
            { title: 'Intro', content: `Welcome to ${projectName}. This is an AI-generated video tutorial.` },
            { title: 'Video', content: 'Let me show you the key features and how to use them effectively.' },
            { title: 'Outro', content: "Thank you for watching. Don't forget to subscribe for more tutorials!" }
        ];
    }

    sections.forEach((sec, index) => {
        const div = document.createElement('div');
        div.className = 'script-section';
        div.innerHTML = `
            <div class="section-header">
                <span class="section-number">${index + 1}</span>
                <span class="section-title" contenteditable="true">${sec.title}</span>
                <div class="section-actions">
                    <button class="icon-btn" onclick="deleteSection(this)"><i data-lucide="trash-2" size="16"></i></button>
                    <button class="icon-btn"><i data-lucide="more-horizontal" size="16"></i></button>
                </div>
            </div>
            <div class="section-content">
                <textarea class="script-textarea" placeholder="Enter script text...">${sec.content}</textarea>
            </div>
        `;
        container.appendChild(div);
    });

    lucide.createIcons();
}

// Project Saving
async function saveProject(silent = false) {
    if (!currentProject) return;

    if (!silent) showToast('Saving project...', 'info');

    // Gather scripts
    const scripts = [];
    document.querySelectorAll('.script-section').forEach(sec => {
        scripts.push({
            title: sec.querySelector('.section-title').textContent,
            content: sec.querySelector('.script-textarea').value
        });
    });

    // Gather timeline
    const timeline = [];
    const timelineContainer = document.querySelector('.timeline-tracks');
    if (timelineContainer) {
        timelineContainer.querySelectorAll('.timeline-track').forEach(track => {
            const label = track.querySelector('.track-label').textContent;
            const clips = [];
            track.querySelectorAll('.track-clip').forEach(clip => {
                clips.push({
                    width: clip.style.width,
                    color: clip.style.backgroundColor
                });
            });
            timeline.push({ label, clips });
        });
    }

    // Gather canvas elements
    const elements = [];
    document.querySelectorAll('.canvas-element').forEach(el => {
        elements.push({
            type: el.dataset.type,
            text: el.innerText,
            style: el.style.cssText
        });
    });

    const updatedContent = {
        ...currentProject.content,
        scripts: scripts,
        timeline: timeline,
        elements: elements,
        lastModified: new Date().toISOString()
    };

    try {
        const res = await fetch(`/api/projects/${currentProject.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: updatedContent
            })
        });

        if (res.ok) {
            currentProject.content = updatedContent;
            if (!silent) showToast('Project saved successfully!', 'success');

            // Show saved indicator
            const savedBadge = document.querySelector('.saved-badge');
            if (savedBadge) savedBadge.style.opacity = 1;
        } else {
            throw new Error('Save failed');
        }
    } catch (err) {
        console.error(err);
        if (!silent) showToast('Failed to save project', 'error');
    }
}

// AI Features interaction
function setupAIButtons() {
    // Generate Speech (TTS)
    const ttsBtn = document.getElementById('generateSpeechBtn');
    if (ttsBtn) {
        ttsBtn.addEventListener('click', async () => {
            // content from first section or all? Let's take focused or first
            const section = document.querySelector('.script-section:focus-within') || document.querySelector('.script-section');
            const text = section ? section.querySelector('textarea').value : '';

            if (!text) return showToast('Please enter script text first', 'error');

            const originalText = ttsBtn.innerHTML;
            ttsBtn.disabled = true;
            ttsBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Generating...';
            lucide.createIcons();

            try {
                const res = await fetch('/api/ai/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, voice: 'alloy' })
                });
                const data = await res.json();

                if (data.success) {
                    showToast('Voiceover generated!', 'success');

                    // visual feedback on timeline
                    const tracks = document.querySelectorAll('.timeline-tracks .timeline-track');
                    // Find or use 2nd track as Audio
                    const audioTrack = tracks.length > 1 ? tracks[1] : tracks[0];

                    if (audioTrack) {
                        const clip = document.createElement('div');
                        clip.className = 'track-clip';
                        // duration relative to 60s total
                        const width = Math.min(100, (data.duration / 60) * 100);
                        clip.style.width = width + '%';
                        clip.style.backgroundColor = '#8b5cf6'; // Purple for audio
                        clip.title = 'AI Voiceover';

                        // Add specific class for audio wave appearance if I had CSS
                        audioTrack.appendChild(clip);
                        saveProject(true);
                    }
                }
            } catch (e) {
                showToast('Failed to generate speech', 'error');
            } finally {
                ttsBtn.innerHTML = originalText;
                ttsBtn.disabled = false;
                lucide.createIcons();
            }
        });
    }

    // AI Rewrite
    const rewriteBtn = document.getElementById('aiRewriteBtn');
    if (rewriteBtn) {
        rewriteBtn.addEventListener('click', async () => {
            const section = document.querySelector('.script-section:focus-within');
            if (!section) return showToast('Please click inside a script section to rewrite', 'error');

            const textarea = section.querySelector('textarea');
            const text = textarea.value;
            if (!text) return showToast('Script section is empty', 'error');

            const originalText = rewriteBtn.innerHTML;
            rewriteBtn.disabled = true;
            rewriteBtn.innerHTML = '<i data-lucide="sparkles" class="spin"></i> Rewriting...';
            lucide.createIcons();

            try {
                const res = await fetch('/api/ai/rewrite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, tone: 'professional' })
                });
                const data = await res.json();
                if (data.success) {
                    textarea.value = data.text;
                    showToast('Script rewritten by AI', 'success');
                    // Trigger save
                    saveProject(true);
                }
            } catch (e) {
                showToast('Rewrite failed', 'error');
            } finally {
                rewriteBtn.innerHTML = originalText;
                rewriteBtn.disabled = false;
                lucide.createIcons();
            }
        });
    }
}

// UI Setup
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
            lucide.createIcons();
        });
    });
}

// Playback Controls
function setupPlaybackControls() {
    const playBtn = document.querySelector('.play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', togglePlayback);
    }

    // Tiny timeline seeking (clicking on tracks)
    const tracksContainer = document.querySelector('.timeline-tracks');
    if (tracksContainer) {
        tracksContainer.addEventListener('click', (e) => {
            const rect = tracksContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, x / rect.width));

            currentTime = percentage * duration;
            if (videoElement) {
                videoElement.currentTime = currentTime;
            }
            updateTimeDisplay();
            updateTimelineCursor();
        });
    }
}

function togglePlayback() {
    isPlaying = !isPlaying;
    const playBtn = document.querySelector('.play-btn');

    if (isPlaying) {
        if (playBtn) playBtn.innerHTML = '<i data-lucide="pause"></i>';
        if (videoElement) videoElement.play();
        else startPlayback();
    } else {
        if (playBtn) playBtn.innerHTML = '<i data-lucide="play"></i>';
        if (videoElement) videoElement.pause();
        else stopPlayback();
    }
    lucide.createIcons();
}

function startPlayback() {
    // Fallback for non-video
    const interval = setInterval(() => {
        if (!isPlaying || videoElement) {
            clearInterval(interval);
            return;
        }
        currentTime += 0.1;
        if (currentTime >= duration) {
            currentTime = 0;
            isPlaying = false;
            togglePlayback(); // Simple toggle off
        }
        updateTimeDisplay();
        updateTimelineCursor();
    }, 100);
}

function stopPlayback() {
    isPlaying = false;
    // UI update handled in toggle
}

function updateTimeDisplay() {
    const timeDisplay = document.querySelector('.time-display');
    if (timeDisplay) {
        const current = formatTime(currentTime);
        const total = formatTime(duration);
        timeDisplay.textContent = `${current} / ${total}`;
    }
}

function updateTimelineCursor() {
    const cursor = document.querySelector('.timeline-playhead');
    if (cursor) {
        const percent = (currentTime / duration) * 100;
        cursor.style.left = `${percent}%`;
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Canvas / Elements Management
function initializeCanvas(elements) {
    const container = document.querySelector('.video-preview .preview-placeholder');
    // Clear dynamic elements, keep bg
    const existing = container.querySelectorAll('.canvas-element');
    existing.forEach(e => e.remove());

    if (elements && Array.isArray(elements)) {
        elements.forEach(el => {
            renderElementToCanvas(el.type, el.text, el.style);
        });
    }
}

function setupElementInteractions() {
    const elementItems = document.querySelectorAll('.element-item');
    elementItems.forEach(item => {
        item.addEventListener('click', () => {
            const elementType = item.querySelector('span').textContent;
            addElementToCanvas(elementType);
        });
    });
}

function addElementToCanvas(elementType) {
    renderElementToCanvas(elementType, elementType);
    showToast(`${elementType} added to canvas`, 'success');
    saveProject(true);
}

function renderElementToCanvas(type, text, styleStr) {
    const container = document.querySelector('.video-preview .preview-placeholder');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'canvas-element';
    el.dataset.type = type;
    el.innerText = text;

    // Default styles
    el.style.cssText = styleStr || `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 0.5rem 1rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        color: white;
        cursor: move;
        font-weight: 500;
        z-index: 10;
        user-select: none;
    `;

    // Simple move to random spot on click (stub for drag)
    el.onclick = (e) => {
        e.stopPropagation();
        el.style.top = (20 + Math.random() * 60) + '%';
        el.style.left = (20 + Math.random() * 60) + '%';
        saveProject(true);
    };

    container.appendChild(el);
}

function setupEffectInteractions() {
    const effectCards = document.querySelectorAll('.effect-card');
    effectCards.forEach(card => {
        card.addEventListener('click', () => {
            const effectName = card.querySelector('span').textContent;
            showToast(`${effectName} effect applied`, 'success');
        });
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            togglePlayback();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveProject();
        }
    });
}

// Script Management
function addScriptSection() {
    const container = document.getElementById('scriptSections');
    const count = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'script-section';
    div.innerHTML = `
        <div class="section-header">
            <span class="section-number">${count}</span>
            <span class="section-title" contenteditable="true">Untitled Section</span>
            <div class="section-actions">
                <button class="icon-btn" onclick="deleteSection(this)"><i data-lucide="trash-2" size="16"></i></button>
            </div>
        </div>
        <div class="section-content">
            <textarea class="script-textarea" placeholder="Enter script text..."></textarea>
        </div>
    `;
    container.appendChild(div);
    lucide.createIcons();
    div.querySelector('textarea').focus();
    saveProject(true);
}

function deleteSection(btn) {
    if (confirm('Delete section?')) {
        btn.closest('.script-section').remove();
        // Renumber
        document.querySelectorAll('.script-section').forEach((sec, i) => {
            sec.querySelector('.section-number').textContent = i + 1;
        });
        saveProject(true);
    }
}

// Timeline Management
function initializeTimeline(data) {
    const container = document.querySelector('.timeline-tracks');
    if (!container) return;

    container.innerHTML = '<div class="timeline-playhead"></div>'; // Add playhead

    let tracks = data || [
        { label: 'Video', clips: [{ width: '100%', color: '#667eea' }] },
        { label: 'Audio', clips: [{ width: '40%', color: '#d4229b' }] }
    ];

    tracks.forEach(track => {
        const trackDiv = document.createElement('div');
        trackDiv.className = 'timeline-track';

        let clipsHtml = '';
        track.clips.forEach(clip => {
            clipsHtml += `<div class="track-clip" style="width: ${clip.width}; background: ${clip.color};"></div>`;
        });

        trackDiv.innerHTML = `
            <div class="track-label">${track.label}</div>
            ${clipsHtml}
        `;
        container.appendChild(trackDiv);
    });
}

function addClip() {
    const container = document.querySelector('.timeline-tracks');
    if (!container) return;

    // Add a new track with a random clip
    const colors = ['#f472b6', '#34d399', '#60a5fa', '#a78bfa'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const div = document.createElement('div');
    div.className = 'timeline-track';
    div.innerHTML = `
        <div class="track-label">New Clip</div>
        <div class="track-clip" style="width: 20%; background: ${randomColor};"></div>
    `;
    container.appendChild(div);

    showToast('New clip added to timeline', 'success');
    saveProject(true);
}

function splitClip() {
    // Visual simulation of split
    const clips = document.querySelectorAll('.track-clip');
    if (clips.length > 0) {
        const lastClip = clips[0]; // Just split the first one for demo
        lastClip.style.width = '15%';
        const clone = lastClip.cloneNode(true);
        // Change color slightly to show split
        clone.style.opacity = '0.8';
        lastClip.after(clone);
        showToast('Clip split at ' + formatTime(currentTime), 'success');
        saveProject(true);
    }
}

// Translation & Modals
function setupTranslateFeature() {
    const modal = document.getElementById('translateModal');
    const openBtn = document.getElementById('translateBtn');
    const closeBtn = document.getElementById('closeTranslate');
    const cancelBtn = document.getElementById('cancelTranslateBtn');
    const startBtn = document.getElementById('startTranslateBtn');

    if (openBtn) {
        openBtn.onclick = () => {
            if (modal) {
                modal.style.display = 'flex';
                setTimeout(() => modal.style.opacity = '1', 10);
            }
        };
    }

    const close = () => {
        if (modal) {
            modal.style.opacity = '0';
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };

    if (closeBtn) closeBtn.onclick = close;
    if (cancelBtn) cancelBtn.onclick = close;
    if (modal) modal.onclick = (e) => { if (e.target === modal) close(); };

    if (startBtn) {
        startBtn.onclick = async () => {
            const originalText = startBtn.innerHTML;
            startBtn.disabled = true;
            startBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Translating...';
            lucide.createIcons();

            // Gather all text from script
            let fullText = "";
            document.querySelectorAll('.script-textarea').forEach(ta => fullText += ta.value + "\\n");

            try {
                const res = await fetch('/api/ai/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: fullText,
                        sourceLang: 'English',
                        targetLang: 'Spanish' // Simplified: just hardcode or get from selector stub
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Project translated to ' + data.lang, 'success');

                    // Simulate updating UI
                    document.querySelectorAll('.script-textarea').forEach(ta => {
                        if (!ta.value.startsWith('[')) {
                            ta.value = `[${data.lang}] ` + ta.value;
                        }
                    });
                    saveProject(true);
                }
                close();
            } catch (e) {
                showToast('Translation failed', 'error');
            } finally {
                startBtn.disabled = false;
                startBtn.innerHTML = originalText;
                lucide.createIcons();
            }
        };
    }
}

async function exportProject() {
    if (!currentProject) return;

    showToast('Starting export...', 'info');

    try {
        const res = await fetch(`/api/projects/${currentProject.id}/export`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showToast('Export processed! Download starting...', 'success');
            // Simulate download trigger after delay
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = '#'; // data.downloadUrl
                a.download = 'project.mp4';
                a.click();
            }, 1000);
        }
    } catch (e) {
        showToast('Export failed', 'error');
    }
}

async function generateSubtitles() {
    if (!currentProject) return;

    showToast('AI is generating subtitles from script...', 'info');

    // Grab all script text
    const sections = document.querySelectorAll('.script-section');
    if (sections.length === 0) return showToast('No script found to generate subtitles', 'error');

    // Define a styled subtitle format
    const subtitleStyle = "position: absolute; bottom: 10%; left: 50%; transform: translateX(-50%); width: 80%; text-align: center; color: white; background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 4px; font-size: 1.2rem; font-weight: 500; font-family: Outfit, sans-serif; pointer-events: none; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);";

    sections.forEach((section, index) => {
        const text = section.querySelector('textarea').value.trim();
        if (text) {
            // Remove translation tag if exists for cleaner subtitles
            const cleanText = text.replace(/^\[.*?\]\s*/, '');

            // Add as canvas element (Only one for now, or multiple if we had timing)
            // Just for the demo, we'll add the first non-empty section as a subtitle
            if (index === 0) {
                renderElementToCanvas('subtitle', cleanText, subtitleStyle);
            }
        }
    });

    showToast('Subtitles generated successfully!', 'success');
    saveProject(true);
}

async function autoCut() {
    if (!currentProject) return;

    showToast('AI is analyzing video for silences...', 'info');

    try {
        const res = await fetch('/api/ai/cuts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: currentProject.id })
        });
        const data = await res.json();

        if (data.success && data.cuts.length > 0) {
            showToast(`AI found ${data.cuts.length} silences. Applying cuts...`, 'success');

            // Visually simulate cuts by adding gaps or splitting clips
            const videoTrack = document.querySelector('.timeline-track');
            if (videoTrack) {
                // Clear and recreate based on cuts (simplified simulation)
                // In a real app we would surgically split
                videoTrack.innerHTML = '<div class="track-label">Video (AI Cut)</div>';

                let lastPos = 0;
                data.cuts.forEach((cut, i) => {
                    // Pre-cut clip
                    const segmentWidth = ((cut.start - lastPos) / 60) * 100;
                    if (segmentWidth > 1) {
                        const clip = document.createElement('div');
                        clip.className = 'track-clip';
                        clip.style.width = segmentWidth + '%';
                        clip.style.backgroundColor = '#667eea';
                        videoTrack.appendChild(clip);
                    }

                    // The "Cut" (gap)
                    const gap = document.createElement('div');
                    gap.className = 'track-clip';
                    gap.style.width = ((cut.end - cut.start) / 60) * 100 + '%';
                    gap.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
                    gap.style.border = '1px dashed #ef4444';
                    gap.title = 'AI Removed: ' + cut.reason;
                    videoTrack.appendChild(gap);

                    lastPos = cut.end;
                });

                // Final clip
                const finalWidth = ((60 - lastPos) / 60) * 100;
                const finalClip = document.createElement('div');
                finalClip.className = 'track-clip';
                finalClip.style.width = finalWidth + '%';
                finalClip.style.backgroundColor = '#667eea';
                videoTrack.appendChild(finalClip);
            }

            saveProject(true);
        }
    } catch (e) {
        showToast('AI Auto-Cut failed', 'error');
    }
}

// Global Exports
window.deleteSection = deleteSection;
window.addScriptSection = addScriptSection;
window.splitClip = splitClip;
window.addClip = addClip;
window.saveProject = saveProject;
window.exportProject = exportProject;
window.autoCut = autoCut;
window.generateSubtitles = generateSubtitles;

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
}

// Check auto-open
function checkAutoOpenTranslate() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open') === 'translate') {
        setTimeout(() => {
            const btn = document.getElementById('translateBtn');
            if (btn) btn.click();
        }, 500);
    }
}

// Spin Animation style
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`;
document.head.appendChild(style);
