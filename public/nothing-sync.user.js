// ==UserScript==
// @name         Nothing Account Auto-Sync
// @namespace    https://essential-space.local/
// @version      1.0
// @description  Automatically sends Nothing Account access token to your self-hosted Essential Space dashboard
// @match        https://account.nothing.tech/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function sendToken() {
        const token = localStorage.getItem('nothingAuth_account-app-web_accessToken');
        if (token) {
            console.log('[Nothing Sync] Access token detected!');
            if (window.opener) {
                window.opener.postMessage({ type: 'NOTHING_AUTH_TOKEN', token: token }, '*');
                window.close();
            }
        }
    }

    // Check immediately
    sendToken();

    // Check periodically if user just completed login
    setInterval(sendToken, 1000);
})();
