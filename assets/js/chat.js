import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
// Import react-markdown without ?bundle so it shares the same React instance
// loaded above. Using ?bundle would cause react-markdown to bundle its own
// separate React copy, which makes createRoot and ReactMarkdown use different
// React contexts and silently crash at runtime.
import ReactMarkdown from 'https://esm.sh/react-markdown@9?deps=react@18,react-dom@18';
// remark-gfm enables GitHub Flavored Markdown extensions: tables, strikethrough,
// task lists, and autolinks — none of which are in the CommonMark default.
import remarkGfm from 'https://esm.sh/remark-gfm@4?deps=react@18,react-dom@18';

// Hoisted outside send() so the array reference is stable across all render()
// calls during streaming. React compares remarkPlugins by reference; a new
// array on every chunk would force a full plugin re-evaluation every delta.
var REMARK_PLUGINS = [remarkGfm];

// localStorage key for persisting the user's model choice.
var MODEL_STORAGE_KEY = 'solorium_chat_model';

// AI Assistant chat page (/ask). Conversation is in-memory only and is wiped
// on every reload by design — nothing is persisted.
if (document.body.classList.contains('ai-chat-page')) {
    var form = document.getElementById('ai-chat-form');
    var input = document.getElementById('ai-chat-input');
    var sendBtn = document.getElementById('ai-chat-send');
    var scroll = document.getElementById('ai-chat-scroll');
    var messagesEl = document.getElementById('ai-chat-messages');
    var greetingEl = document.getElementById('ai-chat-greeting');
    var ghSite = document.querySelector('.gh-site');
    var modelWrap = document.getElementById('ai-chat-model-wrap');
    var modelBtn = document.getElementById('ai-chat-model-btn');
    var modelMenu = document.getElementById('ai-chat-model-menu');
    var modelName = document.getElementById('ai-chat-model-name');
    var modelWarn = document.getElementById('ai-chat-model-warn');
    var ctxRing = document.getElementById('ai-chat-ctx-ring');
    var ctxFill = ctxRing ? ctxRing.querySelector('.ctx-fill') : null;

    // Circumference of the context ring SVG arc (r=14): 2π×14 ≈ 87.96
    var CTX_RING_CIRCUMFERENCE = 87.96;

    // Backend chat endpoint. Override site-wide with Ghost code injection
    // (window.SOLORIUM_AGENT_URL), otherwise use the template's data-endpoint.
    var ENDPOINT = (window.SOLORIUM_AGENT_URL || form?.dataset.endpoint || '').trim();
    // Models endpoint: same origin as the chat endpoint, just different path.
    var MODELS_ENDPOINT = ENDPOINT.replace(/\/chat\/?$/, '/chat/models');

    // Abort the request if the backend doesn't start responding in time, so a
    // hung server falls back to the apology instead of spinning forever.
    var REQUEST_TIMEOUT_MS = 30000;

    // --- Model selector ---------------------------------------------------

    // Rate-limited model IDs (to show warning icon).
    var rateLimitedModels = new Set();

    function stripProviderSlug(modelId) {
        // "openai/gpt-oss-120b" -> "gpt-oss-120b"; "llama-3.3-70b" stays.
        var slash = modelId.indexOf('/');
        return slash !== -1 ? modelId.slice(slash + 1) : modelId;
    }

    var selectedModelId = null;

    function getSelectedModel() {
        return selectedModelId;
    }

    function saveModelPreference(modelId) {
        try {
            localStorage.setItem(MODEL_STORAGE_KEY, modelId);
        } catch (e) { /* quota / private mode */ }
    }

    function loadModelPreference() {
        try {
            return localStorage.getItem(MODEL_STORAGE_KEY) || null;
        } catch (e) {
            return null;
        }
    }

    function populateModelSelect(models) {
        if (!modelMenu || !modelBtn) return;
        modelMenu.innerHTML = '';

        if (!models || models.length === 0) {
            if (modelName) modelName.textContent = 'No model available';
            modelWrap.classList.add('is-ready');
            return;
        }

        var saved = loadModelPreference();
        var defaultValue = (saved && models.includes(saved)) ? saved : models[0];
        selectedModelId = defaultValue;

        models.forEach(function (modelId) {
            var li = document.createElement('li');
            li.dataset.value = modelId;
            li.setAttribute('role', 'option');
            
            var nameSpan = document.createElement('span');
            nameSpan.textContent = stripProviderSlug(modelId);
            li.appendChild(nameSpan);

            var checkSVG = '<svg class="ai-chat-model-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            li.insertAdjacentHTML('beforeend', checkSVG);
            
            if (modelId === defaultValue) {
                li.classList.add('is-selected');
                li.setAttribute('aria-selected', 'true');
                if (modelName) modelName.textContent = nameSpan.textContent;
            } else {
                li.setAttribute('aria-selected', 'false');
            }
            
            li.addEventListener('click', function(e) {
                e.stopPropagation();
                selectModel(modelId, nameSpan.textContent);
            });
            
            modelMenu.appendChild(li);
        });
        modelWrap.classList.add('is-ready');
    }

    function selectModel(modelId, displayName) {
        selectedModelId = modelId;
        if (modelName) modelName.textContent = displayName;
        saveModelPreference(modelId);
        setModelRateLimit(modelId, false);
        
        // Update selected state in menu
        Array.from(modelMenu.children).forEach(function(child) {
            if (child.dataset.value === modelId) {
                child.classList.add('is-selected');
                child.setAttribute('aria-selected', 'true');
            } else {
                child.classList.remove('is-selected');
                child.setAttribute('aria-selected', 'false');
            }
        });
        
        closeMenu();
    }

    function toggleMenu() {
        if (!modelWrap) return;
        var isOpen = modelWrap.classList.contains('is-open');
        if (isOpen) {
            closeMenu();
        } else {
            modelWrap.classList.add('is-open');
            if (modelBtn) modelBtn.setAttribute('aria-expanded', 'true');
        }
    }

    function closeMenu() {
        if (!modelWrap) return;
        modelWrap.classList.remove('is-open');
        if (modelBtn) modelBtn.setAttribute('aria-expanded', 'false');
    }

    if (modelBtn) {
        modelBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMenu();
        });
    }

    document.addEventListener('click', function(e) {
        if (modelWrap && !modelWrap.contains(e.target)) {
            closeMenu();
        }
    });

    function setModelRateLimit(modelId, limited) {
        if (limited) {
            rateLimitedModels.add(modelId);
        } else {
            rateLimitedModels.delete(modelId);
        }
        // Show the warning icon only if the *currently selected* model is limited.
        if (modelWarn) {
            modelWarn.classList.toggle('is-visible', !!selectedModelId && rateLimitedModels.has(selectedModelId));
        }
    }

    // Fetch available models from the backend.
    function loadModels() {
        if (!MODELS_ENDPOINT) return;
        fetch(MODELS_ENDPOINT)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && Array.isArray(data.models)) {
                    populateModelSelect(data.models);
                }
            })
            .catch(function () { /* backend unreachable — leave placeholder */ });
    }

    loadModels();

    // --- Context ring -----------------------------------------------------

    function updateCtxRing(contextUsed, contextLimit) {
        if (!ctxFill || !ctxRing || contextLimit <= 0) return;

        var pct = Math.min(contextUsed / contextLimit, 1);
        var offset = CTX_RING_CIRCUMFERENCE * (1 - pct);
        ctxFill.style.strokeDashoffset = offset.toFixed(2);

        // Label the ring with exact usage.
        var used = contextUsed.toLocaleString();
        var limit = contextLimit.toLocaleString();
        var pctStr = (pct * 100).toFixed(1);
        ctxRing.setAttribute('data-tooltip', used + ' / ' + limit + ' tokens used (' + pctStr + '%)');
        ctxRing.removeAttribute('title');
        ctxRing.setAttribute('aria-label', 'Context window: ' + pctStr + '% used');

        ctxRing.classList.add('has-usage');
        ctxRing.classList.toggle('is-critical', pct >= 0.8);
    }

    // --- Visual viewport / keyboard handling ------------------------------

    // Pin the layout to the *visible* viewport. visualViewport reflects the
    // real on-screen area after the mobile URL bar collapses and when the
    // on-screen keyboard opens — keeping the composer on screen instead of
    // letting it slide below an overflow:hidden viewport. CSS falls back to
    // 100svh until/unless this runs.
    function setAppHeight() {
        var vv = window.visualViewport;
        var h = vv ? vv.height : window.innerHeight;
        var offsetTop = vv ? vv.offsetTop : 0;
        
        // Check for Ghost's native announcement bar
        var annBar = document.querySelector('.gh-announcement-bar');
        var annHeight = annBar ? annBar.offsetHeight : 0;
        var visibleAnnHeight = Math.max(0, annHeight - offsetTop);
        
        document.documentElement.style.setProperty('--app-height', Math.round(h - visibleAnnHeight) + 'px');
        
        // Follow the visual viewport's vertical offset. iOS Safari pans the
        // visual viewport down when the keyboard opens; translating the fixed
        // .gh-site keeps the chat overlaying the visible area instead of sliding
        // up off-screen. We also translate down by the announcement bar height
        // to prevent overlapping it.
        if (ghSite) {
            var topOffset = Math.max(offsetTop, annHeight);
            ghSite.style.transform = topOffset ? 'translateY(' + Math.round(topOffset) + 'px)' : '';
        }
        // Keyboard heuristic: the visual viewport is much shorter than the
        // layout viewport while the on-screen keyboard is up. Used to tighten
        // the gap between the composer and the keyboard.
        var kbOpen = !!vv && (window.innerHeight - vv.height) > 150;
        document.body.classList.toggle('kb-open', kbOpen);
        // Safeguard: if iOS still nudges the document while the keyboard is up,
        // snap it back to the top (the fixed body should already prevent this).
        if (kbOpen && window.scrollY !== 0) {
            window.scrollTo(0, 0);
        }
    }
    setAppHeight();
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setAppHeight);
        window.visualViewport.addEventListener('scroll', setAppHeight);
    }
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    
    // Re-evaluate if the user closes the announcement bar
    document.addEventListener('click', function(e) {
        if (e.target.closest('.gh-announcement-bar')) {
            setTimeout(setAppHeight, 50);
            setTimeout(setAppHeight, 300);
        }
    });

    // In-memory conversation history: [{ role: 'user' | 'assistant', content }]
    var messages = [];
    var awaitingReply = false;

    var GREETINGS = [
        'Hi, how can I help?',
        'Ask me anything about this site.',
        'What would you like to know?',
        'Hey — what can I help you with?'
    ];

    // Shown when the assistant can't be reached. Natural, friendly, and nudges
    // the visitor toward the rest of the site.
    var APOLOGIES = [
        'Sorry, I can’t reach the assistant right now. While I get my act together, feel free to wander through the posts — there’s plenty to explore here.',
        'Hmm, I’m having trouble connecting at the moment. Apologies! In the meantime, why not browse around the site and see what catches your eye?',
        'Looks like I can’t get through to the server just now. Sorry about that! Have a look around the blog while you’re here — there’s lots to discover.',
        'My apologies — I’m unable to answer right now. Please try again in a little while, or explore the rest of the site in the meantime.',
        'Something’s gone quiet on my end and I can’t respond at the moment. Sorry! Feel free to keep exploring the site, and check back again soon.'
    ];

    function pickFrom(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function pickGreeting() {
        if (greetingEl) greetingEl.textContent = pickFrom(GREETINGS);
    }

    function scrollToBottom() {
        // Use requestAnimationFrame to ensure React has rendered before measuring scrollHeight
        requestAnimationFrame(function () {
            scroll.scrollTop = scroll.scrollHeight;
        });
    }

    function addBubble(role, text, extraClass) {
        var bubble = document.createElement('div');
        bubble.className = 'ai-chat-bubble ' + (role === 'user' ? 'is-user' : 'is-agent');
        if (extraClass) bubble.className += ' ' + extraClass;

        if (text) {
            bubble.textContent = text;
        }

        messagesEl.appendChild(bubble);
        scrollToBottom();
        return bubble;
    }

    function autoGrow() {
        // Reset to one line, then grow to fit content (CSS caps the max height).
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    }

    function syncSendState() {
        sendBtn.disabled = awaitingReply || input.value.trim().length === 0;
    }

    function resetInput() {
        input.value = '';
        input.style.height = 'auto';
        syncSendState();
    }

    // Stream a reply from the backend, invoking onDelta(text) for each chunk.
    // Resolves when the stream ends (with however much text arrived). Throws
    // only on a communication failure (network/CORS/non-2xx/no body), which the
    // caller treats as "can't reach the assistant".
    function streamReply(history, modelId, onDelta, onDone) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

        var body = { messages: history };
        if (modelId) body.model = modelId;

        return fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        }).then(function (resp) {
            // Response started — cancel the timeout so a long stream isn't cut off.
            clearTimeout(timer);
            if (!resp.ok || !resp.body) {
                throw new Error('Request failed: ' + resp.status);
            }

            var reader = resp.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            function handleEvent(raw) {
                // An SSE event may have multiple lines; we only read `data:`.
                var lines = raw.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line.indexOf('data:') !== 0) continue;
                    var json = line.slice(5).trim();
                    if (!json) continue;
                    var payload;
                    try {
                        payload = JSON.parse(json);
                    } catch (e) {
                        continue;
                    }
                    if (payload.type === 'delta' && payload.text) {
                        onDelta(payload.text);
                    } else if (payload.type === 'rate_limit') {
                        // Mark the rate-limited model in the UI.
                        setModelRateLimit(payload.model || modelId, true);
                    } else if (payload.type === 'error') {
                        // Server-side error: stop reading, keep any text so far.
                        return true;
                    } else if (payload.type === 'done') {
                        if (onDone && payload.usage) {
                            onDone(payload.usage);
                        }
                        return true;
                    }
                }
                return false;
            }

            function pump() {
                return reader.read().then(function (result) {
                    if (result.done) return;
                    buffer += decoder.decode(result.value, { stream: true });
                    var idx;
                    while ((idx = buffer.indexOf('\n\n')) !== -1) {
                        var stop = handleEvent(buffer.slice(0, idx));
                        buffer = buffer.slice(idx + 2);
                        if (stop) {
                            reader.cancel();
                            return;
                        }
                    }
                    return pump();
                });
            }

            return pump();
        }, function (err) {
            // Fetch rejected (network error, CORS, or timeout abort).
            clearTimeout(timer);
            throw err;
        });
    }

    function send() {
        var text = input.value.trim();
        if (!text || awaitingReply) return;

        var selectedModel = getSelectedModel();

        document.body.classList.add('has-messages');
        messages.push({ role: 'user', content: text });
        addBubble('user', text);
        resetInput();

        awaitingReply = true;
        syncSendState();

        var typing = addBubble('assistant', 'Thinking…', 'is-typing');
        var bubble = null;
        var root = null;
        var acc = '';

        function onDelta(chunk) {
            if (!bubble) {
                typing.remove();
                bubble = addBubble('assistant', '', 'is-streaming'); 
                root = createRoot(bubble);
            }
            acc += chunk;
            // Append a block cursor to the markdown so it renders inline with the text
            root.render(React.createElement(ReactMarkdown, { remarkPlugins: REMARK_PLUGINS }, acc + ' ▍'));
            scrollToBottom();
        }

        function onDone(usage) {
            if (usage && usage.context_used && usage.context_limit) {
                updateCtxRing(usage.context_used, usage.context_limit);
            } else if (usage && usage.total_tokens && usage.context_limit) {
                // Fallback for older backend versions
                updateCtxRing(usage.total_tokens, usage.context_limit);
            }
        }

        function finish(err) {
            awaitingReply = false;
            syncSendState();
            // Only remove typing if onDelta never fired (bubble was never created);
            // if onDelta did fire, typing was already removed there.
            if (!bubble) {
                typing.remove();
            } else {
                bubble.classList.remove('is-streaming');
            }
            if (err) {
                console.error('[chat] Stream error:', err);
            }
            if (acc) {
                // Keep the model's turn in history for multi-turn context.
                messages.push({ role: 'assistant', content: acc });
                if (root) {
                    // Re-render final text without the cursor
                    root.render(React.createElement(ReactMarkdown, { remarkPlugins: REMARK_PLUGINS }, acc));
                    
                    // Wait for React to flush the final render before unmounting
                    setTimeout(function() {
                        var renderedHTML = bubble.innerHTML;
                        root.unmount();
                        bubble.innerHTML = renderedHTML;
                    }, 50);
                }
            } else {
                // No text arrived (comms failure or empty stream): apologize.
                // Not added to history — it's a client-side message, not a turn.
                addBubble('assistant', pickFrom(APOLOGIES));
            }
        }

        streamReply(messages.slice(), selectedModel, onDelta, onDone).then(function () { finish(null); }, finish);
    }

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            send();
        });
    }

    if (input) {
        input.addEventListener('input', function () {
            autoGrow();
            syncSendState();
        });

        // Enter sends; Shift+Enter inserts a newline.
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
    }

    pickGreeting();
    syncSendState();
}
