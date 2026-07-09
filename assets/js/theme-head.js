// Theme color management - runs in <head> to prevent FOUC
// This file is loaded as a standalone script in <head>, NOT bundled into main.min.js

var textColor, originalAccentColorShade, originalAccentColor, originalBackgroundColor;

// Function to dynamically set text color based on background color
function setTextColorBasedOnBackground() {
    var bgColor = getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim().slice(1);
    var r = parseInt(bgColor.substr(0, 2), 16);
    var g = parseInt(bgColor.substr(2, 2), 16);
    var b = parseInt(bgColor.substr(4, 2), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

    textColor = (yiq >= 128) ? 'dark' : 'light';

    document.documentElement.classList.remove('has-light-text', 'has-dark-text');
    document.documentElement.classList.add('has-' + textColor + '-text');
}

// To prevent theme flashing on load, apply classes and background color before the page paints.
var _prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
var _auto = localStorage.getItem('autoDarkMode');
var _manual = localStorage.getItem('darkMode');

if (_auto === 'true' || _manual === null) {
    if (_prefersDark) {
        document.documentElement.style.setProperty('--background-color', 'var(--dark-mode-background-color)');
    }
} else if (_manual === 'true') {
    document.documentElement.classList.add('is-dark-mode');
    document.documentElement.style.setProperty('--background-color', 'var(--dark-mode-background-color)');
} else {
    document.documentElement.classList.add('is-light-mode');
}

setTextColorBasedOnBackground(); // Initial run to set text color based on initial background color

function setAccentColorBasedOnTextColor() {
    var allAtagsSelector = '.gh-content a:not(.toc-link):not(.kg-btn):not(.kg-cta-button):not(.kg-header-card-button):not(.gh-author-name-list > a):not(.kg-header-card-heading > a)';
    var allAtags = document.querySelectorAll(allAtagsSelector);
    var allBlockquotes = document.querySelectorAll('.gh-content blockquote');
    var allInlineCode = document.querySelectorAll(':not(pre) > code');

    if (textColor === 'dark' || originalAccentColorShade === 'bright') {
        if (allAtags.length > 0) allAtags.forEach(function(a) { a.style.color = originalAccentColor; });
        if (allBlockquotes.length > 0) allBlockquotes.forEach(function(blockquote) { blockquote.style.borderColor = originalAccentColor; });
        if (allInlineCode.length > 0) allInlineCode.forEach(function(code) { code.style.color = originalAccentColor; });
    } else {
        var accentRgb = originalAccentColor.trim().slice(1);
        var r = Math.min(255, parseInt(accentRgb.substr(0, 2), 16) + 60);
        var g = Math.min(255, parseInt(accentRgb.substr(2, 2), 16) + 60);
        var b = Math.min(255, parseInt(accentRgb.substr(4, 2), 16) + 60);

        if (allAtags.length > 0) allAtags.forEach(function(a) { a.style.color = 'rgb(' + r + ', ' + g + ', ' + b + ')'; });
        if (allBlockquotes.length > 0) allBlockquotes.forEach(function(blockquote) { blockquote.style.borderColor = 'rgb(' + r + ', ' + g + ', ' + b + ')'; });
        if (allInlineCode.length > 0) allInlineCode.forEach(function(code) { code.style.color = 'rgb(' + r + ', ' + g + ', ' + b + ', 1)'; });
    }
}

function updateThemeIcon(mode) {
    if (mode === 'system') {
        document.documentElement.classList.remove('is-dark-mode', 'is-light-mode');
    } else if (mode === 'light') {
        document.documentElement.classList.remove('is-dark-mode');
        document.documentElement.classList.add('is-light-mode');
    } else if (mode === 'dark') {
        document.documentElement.classList.remove('is-light-mode');
        document.documentElement.classList.add('is-dark-mode');
    }
}

var tooltipTimeout;
function temporarilyShowTooltip(text) {
    var tooltips = document.querySelectorAll('#theme-button .gh-icon-tooltip');
    
    tooltips.forEach(function(tooltip) {
        tooltip.classList.add('is-updating');
        tooltip.classList.add('is-visible');
    });
    
    setTimeout(function() {
        tooltips.forEach(function(tooltip) {
            tooltip.textContent = text;
            tooltip.classList.remove('is-updating');
        });
    }, 200);

    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(function() {
        tooltips.forEach(function(tooltip) {
            tooltip.classList.add('is-updating');
        });
        setTimeout(function() {
            tooltips.forEach(function(tooltip) {
                tooltip.textContent = 'Theme';
                tooltip.classList.remove('is-updating');
                tooltip.classList.remove('is-visible');
                if (tooltip.parentElement) {
                    tooltip.parentElement.blur();
                }
            });
        }, 200);
    }, 2000);
}

// Function to cycle dark mode: System -> Light -> Dark
function changeColorTheme(modeOverride) {
    var auto = localStorage.getItem('autoDarkMode');
    var manual = localStorage.getItem('darkMode');
    var nextMode = modeOverride;
    var tooltipText;
    
    if (!nextMode) {
        if (auto === 'true' || manual === null) {
            nextMode = 'light';
            tooltipText = 'Light mode';
        } else if (manual === 'false') {
            nextMode = 'dark';
            tooltipText = 'Dark mode';
        } else {
            nextMode = 'system';
            tooltipText = 'Follow system';
        }
        temporarilyShowTooltip(tooltipText);
    }

    if (nextMode === 'system') {
        localStorage.setItem('autoDarkMode', 'true');
        localStorage.removeItem('darkMode');
        var prefers_dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefers_dark) {
            document.documentElement.style.setProperty('--background-color', 'var(--dark-mode-background-color)');
        } else {
            document.documentElement.style.setProperty('--background-color', originalBackgroundColor);
        }
    } else if (nextMode === 'light') {
        localStorage.setItem('autoDarkMode', 'false');
        localStorage.setItem('darkMode', 'false');
        document.documentElement.style.setProperty('--background-color', originalBackgroundColor);
    } else if (nextMode === 'dark') {
        localStorage.setItem('autoDarkMode', 'false');
        localStorage.setItem('darkMode', 'true');
        document.documentElement.style.setProperty('--background-color', 'var(--dark-mode-background-color)');
    }
    
    updateThemeIcon(nextMode);
    setTextColorBasedOnBackground();
    setAccentColorBasedOnTextColor();
}

function initColorTheme() {
    setAccentColorBasedOnTextColor();
}
