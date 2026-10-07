/**
 * app.js
 *
 * Master frontend application controller and client-side backend wiring.
 * Connects all pages, handles events, manages live countdowns, modals, toasts,
 * and fixes all navigation anchors and broken links.
 */

(function () {
  'use strict';

  // ---- Utility Helpers ---------------------------------------------------

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function getPageName() {
    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    return file.toLowerCase();
  }

  function formatTimeDigits(num) {
    return num < 10 ? '0' + num : String(num);
  }

  function formatMmSs(ms) {
    if (ms <= 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${formatTimeDigits(minutes)}:${formatTimeDigits(seconds)}`;
  }

  function formatHms(ms) {
    if (ms <= 0) {
      return { hours: '00', minutes: '00', seconds: '00', formatted: '00:00:00' };
    }
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const h = formatTimeDigits(hours);
    const m = formatTimeDigits(minutes);
    const s = formatTimeDigits(seconds);
    return {
      hours: h,
      minutes: m,
      seconds: s,
      formatted: `${h}:${m}:${s}`,
    };
  }

  function formatClockTime(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  }

  // ---- UI Notifications / Toasts -----------------------------------------

  function showToast(message, type = 'teal') {
    let container = document.getElementById('stacks-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'stacks-toast-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        width: min(90vw, 380px);
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const color = type === 'red' ? 'var(--red, #BD564C)' : (type === 'amber' ? 'var(--amber, #D2984E)' : 'var(--teal, #4FA893)');
    const bg = type === 'red' ? '#2B1E1D' : (type === 'amber' ? '#2E271C' : '#1B2E2A');

    toast.style.cssText = `
      background: ${bg};
      border: 1px solid ${color};
      color: #EBEAE6;
      padding: 12px 16px;
      border-radius: 2px;
      font-size: 12.5px;
      font-family: 'IBM Plex Mono', monospace;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      animation: fadeIn 0.2s ease-out;
      pointer-events: auto;
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // ---- Modal Dialog Helper ------------------------------------------------

  function showModal(title, bodyHtml, confirmLabel = 'Done', onConfirm = null) {
    const existing = document.getElementById('stacks-modal-backdrop');
    if (existing) existing.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'stacks-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.75);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 20px; backdrop-filter: blur(2px);
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--surface, #18181A);
      border: 1px solid var(--border, #2C2A2C);
      border-radius: 2px;
      max-width: 380px; width: 100%;
      padding: 24px; color: var(--text-primary, #EBEAE6);
      font-family: 'IBM Plex Mono', monospace;
    `;

    card.innerHTML = `
      <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:600;margin-bottom:12px;">${title}</div>
      <div style="font-size:12.5px;color:var(--text-secondary, #8C8A86);line-height:1.6;margin-bottom:20px;">
        ${bodyHtml}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="modal-cancel-btn" style="
          background:transparent;border:1px solid var(--border,#2C2A2C);
          color:var(--text-secondary,#8C8A86);padding:10px 16px;
          border-radius:2px;font-family:'IBM Plex Mono',monospace;cursor:pointer;font-size:12px;
        ">Cancel</button>
        <button id="modal-confirm-btn" style="
          background:var(--teal,#4FA893);border:none;color:#0D1F1B;
          padding:10px 18px;border-radius:2px;font-weight:500;
          font-family:'IBM Plex Mono',monospace;cursor:pointer;font-size:12px;
        ">${confirmLabel}</button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    card.querySelector('#modal-cancel-btn').addEventListener('click', close);
    card.querySelector('#modal-confirm-btn').addEventListener('click', () => {
      if (onConfirm) onConfirm();
      close();
    });
  }

  // ---- Page Global Fixes (Logo links & tab navigation) --------------------

  function initGlobalNavigation() {
    // Make .mark (Stacks logo) clickable
    const marks = document.querySelectorAll('.mark');
    marks.forEach((mark) => {
      mark.style.cursor = 'pointer';
      mark.addEventListener('click', () => {
        const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
        if (currentUser) {
          window.location.href = 'dashboard.html';
        } else {
          window.location.href = 'landing.html';
        }
      });
    });
  }

  // =========================================================================
  // PAGE CONTROLLERS
  // =========================================================================

  // 1. landing.html
  function initLanding() {
    const freeCount = typeof seatStore !== 'undefined' ? seatStore.getByStatus(SEAT_STATUS.FREE).length : 8;
    const stat1 = document.querySelector('.stat-strip .stat:first-child .num');
    if (stat1) {
      stat1.textContent = `${freeCount} / ${seatStore.getAll().length || 100}`;
    }
  }

  // 2. signin.html
  function initSignin() {
    const form = document.querySelector('form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const forgotLink = document.querySelector('.forgot');

    // Wire forgot password link
    if (forgotLink) {
      forgotLink.href = 'forgot-password.html';
    }

    // Add Staff Sign-in shortcut in footer
    const footerRow = document.querySelector('.footer-row');
    if (footerRow) {
      const staffDiv = document.createElement('p');
      staffDiv.style.cssText = 'margin-top:14px;font-size:11.5px;color:var(--text-muted);text-align:center;';
      staffDiv.innerHTML = `Library personnel? <a href="admin-login.html" style="color:var(--amber);border-bottom:1px solid var(--amber);text-decoration:none;">Staff sign-in</a>`;
      footerRow.parentNode.insertBefore(staffDiv, footerRow.nextSibling);
    }

    // Update status strip with live free seat count
    const statusStrip = document.querySelector('.status-strip span:last-child');
    if (statusStrip && typeof seatStore !== 'undefined') {
      const freeCount = seatStore.getByStatus(SEAT_STATUS.FREE).length;
      statusStrip.textContent = `${freeCount} seats free right now across 3 floors`;
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = emailInput?.value || '';
        const password = passwordInput?.value || '';

        const res = authStore.login(email, password);
        if (res.success) {
          showToast('Signed in successfully', 'teal');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 300);
        } else {
          showToast(res.message || 'Login failed', 'red');
        }
      });
    }
  }

  // 3. signup.html
  function initSignup() {
    const form = document.querySelector('form');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm');

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameInput?.value.trim();
        const email = emailInput?.value.trim();
        const password = passwordInput?.value;
        const confirm = confirmInput?.value;

        if (!name || !email || !password) {
          showToast('Please fill out all fields', 'amber');
          return;
        }

        if (password !== confirm) {
          showToast('Passwords do not match', 'red');
          return;
        }

        if (password.length < 6) {
          showToast('Password should be at least 6 characters', 'amber');
          return;
        }

        authStore.startSignup({ name, email, password });
        showToast('Verification code dispatched', 'teal');
        setTimeout(() => {
          window.location.href = 'otp-verification.html';
        }, 300);
      });
    }
  }

  // 4. otp-verification.html
  function initOtpVerification() {
    const pending = authStore.getPendingSignup();
    const subStrong = document.querySelector('.sub strong');
    if (subStrong && pending && pending.email) {
      subStrong.textContent = pending.email;
    }

    const inputs = document.querySelectorAll('.otp-row input');
    inputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        if (e.target.value && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const clipboardData = e.clipboardData || (typeof window !== 'undefined' && window.clipboardData);
        const pasted = clipboardData ? clipboardData.getData('text') : '';
        const digits = pasted.replace(/\D/g, '').slice(0, inputs.length);
        if (!digits) return;
        digits.split('').forEach((d, i) => {
          if (inputs[i]) inputs[i].value = d;
        });
        const targetIdx = Math.min(digits.length, inputs.length - 1);
        if (inputs[targetIdx]) inputs[targetIdx].focus();
      });
    });

    // 5-minute OTP countdown timer
    let remainingSeconds = 300;
    const timerLine = document.querySelector('.timer-line');
    const timerInterval = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        if (timerLine) timerLine.innerHTML = `<span class="dot"></span> code expired. Please resend.`;
      } else {
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        if (timerLine) {
          timerLine.innerHTML = `<span class="dot"></span> code expires in ${formatTimeDigits(mins)}:${formatTimeDigits(secs)}`;
        }
      }
    }, 1000);

    const resendLink = document.querySelector('.resend-row a');
    if (resendLink) {
      resendLink.href = 'javascript:void(0)';
      resendLink.addEventListener('click', () => {
        remainingSeconds = 300;
        showToast('New code sent: 419419', 'teal');
      });
    }

    const form = document.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        let code = '';
        inputs.forEach((inp) => (code += (inp.value || '').trim()));

        if (code.length < 6) {
          showToast('Please enter the 6-digit verification code', 'amber');
          return;
        }

        const success = authStore.verifyOtp(code);
        if (success) {
          showToast('Account verified!', 'teal');
          setTimeout(() => {
            window.location.href = 'onboarding.html';
          }, 300);
        } else {
          showToast('Please enter the 6-digit verification code', 'amber');
        }
      });
    }
  }

  // 5. onboarding.html
  function initOnboarding() {
    const user = authStore.getCurrentUser();
    const h1 = document.querySelector('h1');
    if (h1 && user && user.name) {
      const firstName = user.name.split(' ')[0];
      h1.textContent = `You're issued a card, ${firstName}.`;
    }

    const ctaBtn = document.querySelector('button.cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => {
        window.location.href = 'matrix.html';
      });
    }

    const skipLink = document.querySelector('.skip');
    if (skipLink) {
      skipLink.href = 'dashboard.html';
    }
  }

  // 6. forgot-password.html
  function initForgotPassword() {
    const form = document.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email')?.value;
        if (!email) {
          showToast('Please enter your college email', 'amber');
          return;
        }
        showToast(`Reset link dispatched to ${email}`, 'teal');
        setTimeout(() => {
          window.location.href = 'signin.html';
        }, 1200);
      });
    }
  }

  // 7. dashboard.html
  function initDashboard() {
    const user = authStore.getCurrentUser() || DEFAULT_STUDENT;

    // Greeting & Avatar
    const greeting = document.querySelector('.greeting');
    if (greeting && user) {
      const hour = new Date().getHours();
      const tod = hour < 12 ? 'morning' : (hour < 17 ? 'afternoon' : 'evening');
      const firstName = (user.name || 'Student').split(' ')[0];
      greeting.textContent = `Good ${tod}, ${firstName}`;
    }

    const avatar = document.querySelector('.avatar');
    if (avatar && user) {
      avatar.textContent = (user.name || 'A')[0].toUpperCase();
    }

    // Active session status card
    const statusCard = document.querySelector('.status-card');
    const activeSeat = seatStore.getUserActiveSeat(user.id);

    if (statusCard) {
      if (!activeSeat) {
        statusCard.innerHTML = `
          <div class="status-label" style="color:var(--text-muted);">no active reservation</div>
          <div class="status-main">
            <span class="seat-name">Ready to Study</span>
            <span class="time-left">${seatStore.getAll().length || 100} seats in catalog</span>
          </div>
          <p class="status-sub">Pick your desk across Silent zone, Near power, or Window rows</p>
          <a class="link-cta" href="matrix.html">Book a seat on the matrix →</a>
        `;
        statusCard.style.borderLeftColor = 'var(--border)';
      } else if (activeSeat.status === SEAT_STATUS.PENDING) {
        statusCard.style.borderLeftColor = 'var(--amber)';
        const bookedAt = activeSeat.bookedAt || Date.now();
        const expiresAt = bookedAt + TIMER_RULES.SCAN_WINDOW_MS;

        const updatePendingTick = () => {
          const rem = Math.max(0, expiresAt - Date.now());
          statusCard.innerHTML = `
            <div class="status-label" style="color:var(--amber);">hold pending QR scan</div>
            <div class="status-main">
              <span class="seat-name">Seat ${activeSeat.id}</span>
              <span class="time-left" style="color:var(--amber);">${formatMmSs(rem)} left</span>
            </div>
            <p class="status-sub">${activeSeat.zone} · Scan QR at seat to confirm</p>
            <a class="link-cta" href="scan.html?seat=${activeSeat.id}" style="color:var(--amber);border-bottom-color:var(--amber);">Scan QR code now →</a>
          `;
        };
        updatePendingTick();
        setInterval(updatePendingTick, 1000);
      } else if (activeSeat.status === SEAT_STATUS.OCCUPIED) {
        statusCard.style.borderLeftColor = 'var(--teal)';
        const sessionEndsAt = activeSeat.sessionEndsAt || (Date.now() + 52 * 60 * 1000);

        const updateOccupiedTick = () => {
          const rem = sessionEndsAt - Date.now();
          if (rem <= 0) {
            if (typeof notificationStore !== 'undefined' && typeof notificationStore.notifyVacate === 'function') {
              notificationStore.notifyVacate(activeSeat.id);
            }
            window.location.href = `vacate-now.html?seat=${activeSeat.id}`;
            return;
          }
          const mins = Math.floor(rem / 60000);
          statusCard.innerHTML = `
            <div class="status-label">active session</div>
            <div class="status-main">
              <span class="seat-name">Seat ${activeSeat.id}</span>
              <span class="time-left">${mins > 0 ? `${mins} min left` : formatMmSs(rem)}</span>
            </div>
            <p class="status-sub">Reading hall · Ground floor · ${activeSeat.zone.toLowerCase()}</p>
            <a class="link-cta" href="active-session.html?seat=${activeSeat.id}">Go to session →</a>
          `;
        };
        updateOccupiedTick();
        setInterval(updateOccupiedTick, 1000);
      } else if (activeSeat.status === SEAT_STATUS.OVERSTAY) {
        statusCard.style.borderLeftColor = 'var(--red)';
        statusCard.innerHTML = `
          <div class="status-label" style="color:var(--red);">grace period expired</div>
          <div class="status-main">
            <span class="seat-name" style="color:var(--red);">Seat ${activeSeat.id}</span>
            <span class="time-left" style="color:var(--red);">Overstay flagged</span>
          </div>
          <p class="status-sub">Your session ended. Please vacate the seat immediately.</p>
          <a class="link-cta" href="vacate-now.html?seat=${activeSeat.id}" style="color:var(--red);border-bottom-color:var(--red);">Vacate seat now →</a>
        `;
      }
    }

    // Quick Stats
    const stats = historyStore.getStats();
    const quickItems = document.querySelectorAll('.quick-grid .quick-item .num');
    if (quickItems && quickItems.length >= 2) {
      quickItems[0].textContent = String(stats.completed);
      quickItems[1].textContent = String(stats.noShows);
    }
  }

  // 8. matrix.html
  function initMatrix() {
    const session = (typeof authStore !== 'undefined' && authStore.getAdminSession()) || null;
    const requestedAdmin = getQueryParam('role') === 'admin';

    // If student attempts to access admin mode via URL without an active admin session, redirect to login
    if (requestedAdmin && (!session || session.role !== 'admin')) {
      if (typeof showToast === 'function') {
        showToast('Staff credentials required for admin mode', 'amber');
      }
      window.location.replace('admin-login.html');
      return;
    }

    const isAdmin = Boolean(session && session.role === 'admin');

    let selectedSeatId = 'A1';
    let currentZone = 'all';

    const main = document.querySelector('main');
    const footerSeatName = document.querySelector('footer .seat-name');
    const footerTimerNote = document.querySelector('footer .timer-note');
    const footerCta = document.querySelector('footer .cta');
    const zoneTabs = document.querySelectorAll('.zone-tabs .zone-tab');
    const topRow = document.querySelector('.top-row');

    // Header Back Link & Role Badge
    if (topRow) {
      let backLink = topRow.querySelector('.back-btn');
      if (!backLink) {
        backLink = document.createElement('a');
        backLink.className = 'back-btn';
        topRow.appendChild(backLink);
      }
      backLink.style.cssText = 'color:var(--text-secondary);text-decoration:none;font-size:12px;border:1px solid var(--border);padding:4px 10px;border-radius:2px;display:inline-flex;align-items:center;';

      if (isAdmin) {
        backLink.href = 'admin-dashboard.html';
        backLink.textContent = '← Admin Dashboard';
        if (!topRow.querySelector('.role-badge')) {
          const badge = document.createElement('span');
          badge.className = 'role-badge';
          badge.style.cssText = 'background:#241E16;color:var(--amber);border:1px solid var(--amber-border);font-size:10px;padding:3px 8px;border-radius:2px;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;margin-left:auto;margin-right:8px;';
          badge.textContent = 'Staff Admin';
          topRow.insertBefore(badge, backLink);
        }
      } else {
        backLink.href = 'dashboard.html';
        backLink.textContent = '← Dashboard';
      }
    }

    // Admin bottom navigation bar
    if (isAdmin) {
      let adminTabbar = document.querySelector('nav.tabbar');
      if (!adminTabbar) {
        adminTabbar = document.createElement('nav');
        adminTabbar.className = 'tabbar';
        adminTabbar.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:680px;display:flex;background:var(--bg);border-top:1px solid var(--border-soft);padding:10px 12px 14px;z-index:100;';
        adminTabbar.innerHTML = `
          <a href="admin-dashboard.html" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--text-muted);font-size:10px;"><span class="glyph" style="font-family:'Fraunces',serif;font-size:16px;">⌂</span>Dashboard</a>
          <a class="active" href="matrix.html?role=admin" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--amber);font-size:10px;"><span class="glyph" style="font-family:'Fraunces',serif;font-size:16px;">▦</span>Seats</a>
          <a href="javascript:void(0)" class="admin-users-tab" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--text-muted);font-size:10px;"><span class="glyph" style="font-family:'Fraunces',serif;font-size:16px;">☰</span>Users</a>
          <a href="javascript:void(0)" class="admin-reports-tab" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--text-muted);font-size:10px;"><span class="glyph" style="font-family:'Fraunces',serif;font-size:16px;">◐</span>Reports</a>
        `;
        document.body.appendChild(adminTabbar);

        adminTabbar.querySelector('.admin-users-tab')?.addEventListener('click', () => {
          showModal('Registered Library Users', '<p>Active library students enrolled across departments.</p><div style="font-size:11px;color:var(--text-muted);margin-top:10px;"><div style="padding:6px 0;border-bottom:1px solid var(--border);">USR-042: Ananya Rao (B.Tech CSE · 3rd year)</div><div style="padding:6px 0;border-bottom:1px solid var(--border);">USR-099: Rohan Verma (M.Tech VLSI)</div><div style="padding:6px 0;border-bottom:1px solid var(--border);">USR-101: Sara Khan (B.Tech EE · 2nd year)</div><div style="padding:6px 0;">USR-102: Dev Patel (B.Des · 4th year)</div></div>', 'Close', null);
        });
        adminTabbar.querySelector('.admin-reports-tab')?.addEventListener('click', () => {
          showModal('Library Utilization Reports', '<div style="font-size:12px;"><p style="margin-bottom:8px;">Total Capacity: <strong>100 Seats</strong></p><p style="margin-bottom:8px;">Peak Occupancy Today: <strong>88% (4:30 PM)</strong></p><p style="margin-bottom:8px;">Average Session Duration: <strong>1h 48m</strong></p><p style="color:var(--teal);">No-show rate lowered by 34% this term.</p></div>', 'Export Summary', () => {
            showToast('Report exported as CSV', 'teal');
          });
        });
      }
      const footer = document.querySelector('footer');
      if (footer) {
        footer.style.paddingBottom = '60px';
      }
    }

    function openAdminSeatModal(seatId) {
      const s = seatStore.get(seatId);
      if (!s) return;
      showModal(
        `Staff Control · Seat ${s.id}`,
        `<p>Status: <strong style="color:var(--${s.status === 'free' ? 'teal' : (s.status === 'overstay' ? 'red' : 'amber')});">${s.status.toUpperCase()}</strong></p>
         <p style="font-size:12px;color:var(--text-muted);margin:8px 0 14px;">Zone: ${s.zone} · ${s.seatType || 'Individual study desk'}</p>
         <div style="display:flex;gap:8px;flex-wrap:wrap;">
           <button id="modal-set-free" style="background:#1B2E2A;border:1px solid var(--teal);color:var(--teal);padding:8px 12px;border-radius:2px;cursor:pointer;font-family:'IBM Plex Mono';font-size:11px;">Set Free</button>
           <button id="modal-set-maint" style="background:#201F21;border:1px solid var(--border);color:var(--text-secondary);padding:8px 12px;border-radius:2px;cursor:pointer;font-family:'IBM Plex Mono';font-size:11px;">Maintenance</button>
           <button id="modal-flag-overstay" style="background:#2C1615;border:1px solid var(--red);color:var(--red);padding:8px 12px;border-radius:2px;cursor:pointer;font-family:'IBM Plex Mono';font-size:11px;">Flag Overstay</button>
         </div>`,
        'Done',
        null
      );

      setTimeout(() => {
        document.getElementById('modal-set-free')?.addEventListener('click', () => {
          seatStore.update(s.id, { status: SEAT_STATUS.FREE, bookedBy: null, sessionEndsAt: null, bookedAt: null });
          showToast(`Seat ${s.id} is now FREE`, 'teal');
          const bd = document.getElementById('stacks-modal-backdrop');
          if (bd) bd.remove();
          renderSeats();
          updateFooter();
        });
        document.getElementById('modal-set-maint')?.addEventListener('click', () => {
          seatStore.update(s.id, { status: SEAT_STATUS.MAINTENANCE, bookedBy: null, sessionEndsAt: null, bookedAt: null });
          showToast(`Seat ${s.id} marked MAINTENANCE`, 'amber');
          const bd = document.getElementById('stacks-modal-backdrop');
          if (bd) bd.remove();
          renderSeats();
          updateFooter();
        });
        document.getElementById('modal-flag-overstay')?.addEventListener('click', () => {
          seatStore.flagOverstay(s.id);
          showToast(`Seat ${s.id} flagged OVERSTAY`, 'red');
          const bd = document.getElementById('stacks-modal-backdrop');
          if (bd) bd.remove();
          renderSeats();
          updateFooter();
        });
      }, 50);
    }

    function renderSeats() {
      if (!main) return;
      const allSeats = seatStore.getAll();
      const filtered = currentZone === 'all' ? allSeats : allSeats.filter(s => s.zone.toLowerCase().includes(currentZone.toLowerCase()));

      // Group all Rows A through J dynamically
      const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const rows = {};
      rowLetters.forEach(l => { rows['Row ' + l] = []; });
      filtered.forEach((s) => {
        const rowKey = 'Row ' + s.id[0];
        if (!rows[rowKey]) rows[rowKey] = [];
        rows[rowKey].push(s);
      });

      for (const seatList of Object.values(rows)) {
        seatList.sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
      }

      let html = '';
      for (const [rowName, seatList] of Object.entries(rows)) {
        if (seatList.length === 0) continue;
        html += `<p class="row-label">${rowName}</p><div class="seat-grid">`;
        for (const seat of seatList) {
          const isSelected = seat.id === selectedSeatId && (isAdmin || seat.status === SEAT_STATUS.FREE);
          const statusClass = isSelected ? 'selected' : seat.status;
          const stateLabel = isSelected ? 'selected' : (seat.status === SEAT_STATUS.PENDING ? 'held' : (seat.status === SEAT_STATUS.OVERSTAY ? 'flagged' : seat.status));
          html += `
            <div class="seat ${statusClass}" data-seat-id="${seat.id}" style="cursor:pointer;">
              <span class="id">${seat.id}</span>
              <span class="state">${stateLabel}</span>
            </div>
          `;
        }
        html += `</div>`;
      }

      html += `
        <div class="legend">
          <span class="legend-item"><span class="legend-dot free"></span>free</span>
          <span class="legend-item"><span class="legend-dot selected"></span>selected</span>
          <span class="legend-item"><span class="legend-dot pending"></span>held, unconfirmed</span>
          <span class="legend-item"><span class="legend-dot occupied"></span>occupied</span>
          <span class="legend-item"><span class="legend-dot overstay"></span>overstay flagged</span>
          <span class="legend-item"><span class="legend-dot maintenance"></span>maintenance</span>
        </div>
      `;

      main.innerHTML = html;

      // Attach seat click handlers
      main.querySelectorAll('.seat').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-seat-id');
          const seat = seatStore.get(id);
          if (!seat) return;

          if (isAdmin) {
            selectedSeatId = id;
            updateFooter();
            renderSeats();
            openAdminSeatModal(id);
          } else {
            if (seat.status === SEAT_STATUS.FREE) {
              selectedSeatId = id;
              updateFooter();
              renderSeats();
            } else if (seat.status === SEAT_STATUS.OCCUPIED) {
              showToast(`Seat ${id} is occupied until ${seat.sessionEndsAt ? formatClockTime(seat.sessionEndsAt) : 'later'}`, 'amber');
            } else if (seat.status === SEAT_STATUS.PENDING) {
              showToast(`Seat ${id} is held pending QR check-in`, 'amber');
            } else if (seat.status === SEAT_STATUS.OVERSTAY) {
              showToast(`Seat ${id} is flagged for staff check`, 'red');
            } else if (seat.status === SEAT_STATUS.MAINTENANCE) {
              showToast(`Seat ${id} is currently under maintenance`, 'amber');
            }
          }
        });
      });
    }

    function updateFooter() {
      const seat = seatStore.get(selectedSeatId);
      if (footerSeatName) footerSeatName.textContent = `Seat ${selectedSeatId}`;
      if (isAdmin) {
        if (footerTimerNote && seat) {
          footerTimerNote.textContent = `${seat.status.toUpperCase()} · ${seat.zone}`;
        }
        if (footerCta) {
          footerCta.textContent = `Manage seat ${selectedSeatId}`;
          footerCta.style.background = 'var(--amber)';
          footerCta.style.color = '#1A1408';
        }
      } else {
        if (footerTimerNote) {
          footerTimerNote.textContent = '10 min to scan once booked';
        }
        if (footerCta) {
          footerCta.textContent = `Book seat ${selectedSeatId}`;
        }
      }
    }

    // Zone tabs
    zoneTabs.forEach((tab) => {
      tab.style.cursor = 'pointer';
      tab.addEventListener('click', () => {
        zoneTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const text = tab.textContent.trim().toLowerCase();
        currentZone = text;
        renderSeats();
      });
    });

    if (footerCta) {
      footerCta.addEventListener('click', () => {
        if (isAdmin) {
          openAdminSeatModal(selectedSeatId);
        } else {
          const seat = seatStore.get(selectedSeatId);
          if (seat && seat.status === SEAT_STATUS.FREE) {
            window.location.href = `seat-detail.html?seat=${selectedSeatId}`;
          } else {
            showToast(`Seat ${selectedSeatId} is not available`, 'amber');
          }
        }
      });
    }

    // Default selection: pick first available free seat
    const firstFree = seatStore.getByStatus(SEAT_STATUS.FREE)[0];
    if (firstFree) selectedSeatId = firstFree.id;

    updateFooter();
    renderSeats();

    window.addEventListener('stacks:seats-updated', () => {
      renderSeats();
      updateFooter();
    });
  }

  // 9. seat-detail.html
  function initSeatDetail() {
    const seatId = getQueryParam('seat') || 'A1';
    const seat = seatStore.get(seatId) || {
      id: seatId,
      zone: 'Silent zone',
      status: SEAT_STATUS.FREE,
      powerOutlet: 'Yes, at desk',
      nearWindow: 'No',
      noiseLevel: 'Silent zone',
      seatType: 'Individual desk',
    };

    // Update Seat Heading & Location
    const heroH1 = document.querySelector('.seat-hero h1');
    if (heroH1) heroH1.textContent = `Seat ${seat.id}`;
    document.title = `Seat ${seat.id} — Stacks`;

    const loc = document.querySelector('.location');
    if (loc) loc.textContent = `Reading hall · Ground floor · ${seat.zone.toLowerCase()}`;

    // Update Attributes
    const attrs = document.querySelectorAll('.attributes .attr .val');
    if (attrs.length >= 4) {
      attrs[0].textContent = seat.powerOutlet || 'Yes, at desk';
      attrs[1].textContent = seat.nearWindow || 'No';
      attrs[2].textContent = seat.noiseLevel || seat.zone;
      attrs[3].textContent = seat.seatType || 'Individual desk';
    }

    // Duration options
    let selectedDuration = 2;
    const durationOpts = document.querySelectorAll('.duration-opt');
    durationOpts.forEach((opt) => {
      opt.style.cursor = 'pointer';
      opt.addEventListener('click', () => {
        durationOpts.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        const dur = parseInt(opt.textContent) || 2;
        selectedDuration = dur;
      });
    });

    // Wire interactive Enable Notifications button
    const notifBtn = document.getElementById('enable-notif-btn');
    const updateNotifBtnState = () => {
      if (!notifBtn || typeof notificationStore === 'undefined') return;
      if (notificationStore.hasPermission()) {
        notifBtn.textContent = '✓ Enabled';
        notifBtn.style.background = 'transparent';
        notifBtn.style.borderColor = 'var(--teal)';
        notifBtn.style.color = 'var(--teal)';
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        notifBtn.textContent = 'Blocked';
        notifBtn.style.background = '#2B1E1D';
        notifBtn.style.borderColor = 'var(--red)';
        notifBtn.style.color = 'var(--red)';
      } else {
        notifBtn.textContent = 'Enable alerts';
        notifBtn.style.background = '#1B2E2A';
        notifBtn.style.borderColor = 'var(--teal)';
        notifBtn.style.color = 'var(--teal)';
      }
    };
    updateNotifBtnState();

    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        if (typeof notificationStore !== 'undefined') {
          const perm = await notificationStore.requestPermission();
          if (perm === 'granted') {
            showToast('Browser notifications enabled!', 'teal');
            if (typeof notificationStore.initAudioContext === 'function') {
              notificationStore.initAudioContext();
            }
          } else if (perm === 'denied') {
            showToast('Notifications blocked. Check browser address bar permissions.', 'amber');
          }
          updateNotifBtnState();
        }
      });
    }

    // Book CTA
    const cta = document.querySelector('footer .cta');
    if (cta) {
      cta.textContent = `Book seat ${seat.id}`;
      cta.addEventListener('click', (e) => {
        e.preventDefault();
        const user = authStore.getCurrentUser() || DEFAULT_STUDENT;

        // Check if user already holds an active seat
        const existing = seatStore.getUserActiveSeat(user.id);
        if (existing && existing.id !== seat.id) {
          showToast(`You already have an active hold on Seat ${existing.id}`, 'amber');
          setTimeout(() => {
            window.location.href = `booking-confirmation.html?seat=${existing.id}`;
          }, 1200);
          return;
        }

        // 1. Ensure notification permissions are requested on user gesture
        if (typeof notificationStore !== 'undefined' && typeof notificationStore.requestPermission === 'function') {
          notificationStore.requestPermission();
          if (typeof notificationStore.initAudioContext === 'function') {
            notificationStore.initAudioContext();
          }
        }

        // 2. Record booking in seatStore
        seatStore.bookSeat(seat.id, user.id, selectedDuration);

        // 3. Navigate to booking confirmation
        window.location.href = `booking-confirmation.html?seat=${seat.id}&duration=${selectedDuration}`;
      });
    }
  }

  // 10. booking-confirmation.html
  function initBookingConfirmation() {
    // Prompt for notification permissions if still pending when user lands on confirmation screen
    if (typeof notificationStore !== 'undefined' && typeof notificationStore.requestPermission === 'function') {
      const Notif = (typeof window !== 'undefined' && window.Notification) || (typeof globalThis !== 'undefined' && globalThis.Notification);
      if (Notif && Notif.permission === 'default') {
        notificationStore.requestPermission();
      }
    }
    const seatId = getQueryParam('seat') || 'A1';
    const seat = seatStore.get(seatId);

    const seatName = document.querySelector('.ticket .seat-name');
    if (seatName) seatName.textContent = seatId;

    const loc = document.querySelector('.ticket .location');
    if (loc && seat) loc.textContent = `Reading hall · Ground floor · ${seat.zone.toLowerCase()}`;

    const durVal = document.querySelector('.ticket-rows .ticket-row:first-child .val');
    if (durVal && seat) durVal.textContent = `${seat.durationHours || 2} hours`;

    const bookedVal = document.querySelector('.ticket-rows .ticket-row:last-child .val');
    if (bookedVal && seat && seat.bookedAt) {
      bookedVal.textContent = formatClockTime(seat.bookedAt);
    }

    // Countdown chip (10 minutes)
    const countdownChip = document.querySelector('.countdown-chip');
    const bookedAt = seat?.bookedAt || Date.now();
    const expiresAt = bookedAt + TIMER_RULES.SCAN_WINDOW_MS;

    const tick = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        seatStore.expireBooking(seatId);
        window.location.href = `booking-expired.html?seat=${seatId}`;
        return;
      }
      if (countdownChip) {
        countdownChip.innerHTML = `<span class="dot"></span> ${formatMmSs(remaining)} left to scan`;
      }
    };
    tick();
    const timer = setInterval(tick, 1000);

    const cta = document.querySelector('.cta');
    if (cta) {
      cta.href = `scan.html?seat=${seatId}`;
    }
  }

  // 11. scan.html
  function initScan() {
    const seatId = getQueryParam('seat') || 'A1';
    const seat = seatStore.get(seatId);

    const seatTagVal = document.querySelector('.seat-tag .value');
    if (seatTagVal) seatTagVal.textContent = `Seat ${seatId}`;

    const instruction = document.querySelector('.instruction');
    if (instruction) instruction.textContent = `Scan the QR at seat ${seatId}`;

    // Timer chip
    const timerChip = document.querySelector('.timer-chip');
    const bookedAt = seat?.bookedAt || Date.now();
    const expiresAt = bookedAt + TIMER_RULES.SCAN_WINDOW_MS;

    const tick = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        seatStore.expireBooking(seatId);
        window.location.href = `booking-expired.html?seat=${seatId}`;
        return;
      }
      if (timerChip) {
        timerChip.innerHTML = `<span class="dot"></span> ${formatMmSs(remaining)} to scan`;
      }
    };
    tick();
    setInterval(tick, 1000);

    // Interactive scan: Click the viewfinder to simulate QR scan
    const frame = document.querySelector('.frame');
    if (frame) {
      frame.style.cursor = 'pointer';
      const frameSpan = frame.querySelector('.frame-inner span');
      if (frameSpan) frameSpan.textContent = 'tap to scan QR';

      frame.addEventListener('click', () => {
        completeScan();
      });
    }

    // Fallback button: Enter seat code manually
    const fallbackBtn = document.querySelector('.fallback');
    if (fallbackBtn) {
      fallbackBtn.addEventListener('click', () => {
        showModal(
          'Enter Seat Code',
          `<p style="margin-bottom:12px;">Type the code printed on your desk's QR sticker:</p>
           <input id="manual-seat-code" type="text" value="${seatId}" style="
             width:100%;background:var(--surface-raised,#201F21);border:1px solid var(--teal,#4FA893);
             color:#EBEAE6;padding:12px;font-family:'IBM Plex Mono',monospace;font-size:16px;border-radius:2px;outline:none;
           ">`,
          'Confirm Code',
          () => {
            const entered = document.getElementById('manual-seat-code')?.value.trim().toUpperCase();
            if (entered === seatId) {
              completeScan();
            } else {
              showToast(`Code doesn't match booked Seat ${seatId}`, 'red');
            }
          }
        );
      });
    }

    function completeScan() {
      const user = authStore.getCurrentUser() || DEFAULT_STUDENT;
      seatStore.confirmSeatScan(seatId, user.id);
      showToast(`QR Code Verified for Seat ${seatId}!`, 'teal');
      setTimeout(() => {
        window.location.href = `active-session.html?seat=${seatId}`;
      }, 400);
    }
  }

  // 12. active-session.html
  function initActiveSession() {
    const user = authStore.getCurrentUser() || DEFAULT_STUDENT;
    const seatId = getQueryParam('seat') || seatStore.getUserActiveSeat(user.id)?.id || 'A2';
    const seat = seatStore.get(seatId);

    const seatStrong = document.querySelector('.seat-line strong');
    if (seatStrong) seatStrong.textContent = seatId;

    const ringInner = document.querySelector('.ring-inner');
    const hoursEl = document.querySelector('.timer-hours');
    const minsEl = document.querySelector('.timer-minutes');
    const secsEl = document.querySelector('.timer-seconds');
    const timerSub = document.querySelector('.timer-sub');

    const sessionEndsAt = seat?.sessionEndsAt || (Date.now() + 52 * 60 * 1000);
    if (timerSub) {
      timerSub.textContent = `Session ends at ${formatClockTime(sessionEndsAt)}`;
    }

    const tick = () => {
      const rem = sessionEndsAt - Date.now();
      if (rem <= 0) {
        if (typeof notificationStore !== 'undefined' && typeof notificationStore.notifyVacate === 'function') {
          notificationStore.notifyVacate(seatId);
        }
        seatStore.flagOverstay(seatId);
        window.location.href = `vacate-now.html?seat=${seatId}`;
        return;
      }
      const hms = formatHms(rem);
      if (hoursEl) hoursEl.textContent = hms.hours;
      if (minsEl) minsEl.textContent = hms.minutes;
      if (secsEl) secsEl.textContent = hms.seconds;
      if (ringInner) ringInner.textContent = hms.formatted;
    };
    tick();
    setInterval(tick, 1000);

    // End session early
    const endBtn = document.querySelector('.btn-primary');
    if (endBtn) {
      endBtn.href = `vacate-now.html?seat=${seatId}`;
    }
  }

  // 13. vacate-now.html
  function initVacateNow() {
    const user = authStore.getCurrentUser() || DEFAULT_STUDENT;
    const seatId = getQueryParam('seat') || seatStore.getUserActiveSeat(user.id)?.id || 'A2';
    const seat = seatStore.get(seatId);

    const seatStrong = document.querySelector('.seat-line strong');
    if (seatStrong) seatStrong.textContent = seatId;

    // Trigger audio chime and platform notification if arriving upon session expiry
    if (typeof notificationStore !== 'undefined' && typeof notificationStore.notifyVacate === 'function') {
      notificationStore.notifyVacate(seatId);
    }

    // Grace period timer: 5 minutes from session end (or now)
    const graceEndsAt = Date.now() + TIMER_RULES.VACATE_WINDOW_MS;
    const timerEl = document.querySelector('.timer');

    const tick = () => {
      const rem = graceEndsAt - Date.now();
      if (rem <= 0) {
        if (timerEl) timerEl.textContent = '00:00';
        seatStore.flagOverstay(seatId);
        showToast('Grace period ended. Seat flagged.', 'red');
        if (typeof notificationStore !== 'undefined') {
          notificationStore.playAudioChime();
          notificationStore.sendPlatformNotification(`Overstay Flagged · Seat ${seatId}`, {
            body: `Grace period expired for Seat ${seatId}. Library personnel have been notified.`,
            tag: `overstay-${seatId}`,
          });
        }
        return;
      }
      if (timerEl) timerEl.textContent = formatMmSs(rem);
    };
    tick();
    setInterval(tick, 1000);

    const cta = document.querySelector('footer .cta');
    if (cta) {
      cta.addEventListener('click', (e) => {
        e.preventDefault();
        seatStore.vacateSeat(seatId);
        showToast(`Seat ${seatId} vacated. Thank you!`, 'teal');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 400);
      });
    }
  }

  // 14. booking-expired.html
  function initBookingExpired() {
    const seatId = getQueryParam('seat') || 'B1';
    const rowVals = document.querySelectorAll('.ticket .row .val');
    if (rowVals.length >= 4) {
      rowVals[0].textContent = seatId;
      rowVals[1].textContent = formatClockTime(Date.now() - 10 * 60 * 1000);
      rowVals[2].textContent = formatClockTime(Date.now());
    }
  }

  // 15. history.html
  function initHistory() {
    const stats = historyStore.getStats();
    const items = document.querySelectorAll('.summary-row .summary-item .num');
    if (items.length >= 3) {
      items[0].textContent = String(stats.completed);
      items[1].textContent = String(stats.noShows);
      items[2].textContent = String(stats.overstays);
    }

    const main = document.querySelector('main');
    const existingEntries = main.querySelectorAll('.entry, .section-label');
    existingEntries.forEach(e => e.remove());

    const all = historyStore.getAll();
    const groups = {};
    for (const h of all) {
      const g = h.group || 'Today';
      if (!groups[g]) groups[g] = [];
      groups[g].push(h);
    }

    for (const [groupName, list] of Object.entries(groups)) {
      const label = document.createElement('p');
      label.className = 'section-label';
      label.textContent = groupName;
      main.appendChild(label);

      for (const entry of list) {
        const row = document.createElement('div');
        row.className = 'entry';
        const tagClass = entry.status === HISTORY_STATUS.COMPLETED ? 'completed' : (entry.status === HISTORY_STATUS.NO_SHOW ? 'no-show' : 'overstay');
        row.innerHTML = `
          <div class="entry-left">
            <span class="entry-seat">${entry.seatId}</span>
            <span class="entry-meta">${entry.timeLabel || entry.duration || '2 hrs'} · ${entry.zone || 'Silent zone'}</span>
          </div>
          <span class="entry-tag ${tagClass}">${entry.status}</span>
        `;
        main.appendChild(row);
      }
    }
  }

  // 16. notifications.html
  function initNotifications() {
    const main = document.querySelector('main');
    const existingAlerts = main.querySelectorAll('.alert, .section-label');
    existingAlerts.forEach(a => a.remove());

    const all = notificationStore.getAll();
    const groups = {};
    for (const n of all) {
      const g = n.group || 'Today';
      if (!groups[g]) groups[g] = [];
      groups[g].push(n);
    }

    for (const [groupName, list] of Object.entries(groups)) {
      const label = document.createElement('p');
      label.className = 'section-label';
      label.textContent = groupName;
      main.appendChild(label);

      for (const notif of list) {
        const div = document.createElement('div');
        div.className = 'alert';
        div.innerHTML = `
          <div class="alert-icon ${notif.type}">${notif.icon || '•'}</div>
          <div class="alert-body">
            <div class="alert-title">${notif.title}</div>
            <div class="alert-desc">${notif.desc}</div>
            <div class="alert-time">${notif.time || 'Just now'}</div>
          </div>
          ${notif.unread ? '<span class="unread-dot"></span>' : ''}
        `;
        main.appendChild(div);
      }
    }

    // Mark as read after viewing
    setTimeout(() => {
      notificationStore.markAllAsRead();
    }, 2000);
  }

  // 17. profile.html
  function initProfile() {
    const user = authStore.getCurrentUser() || DEFAULT_STUDENT;

    // Populate user card
    const avatar = document.querySelector('.id-avatar');
    if (avatar) avatar.textContent = (user.name || 'A')[0].toUpperCase();

    const nameEl = document.querySelector('.id-info .name');
    if (nameEl) nameEl.textContent = user.name || 'Student';

    const metaEl = document.querySelector('.id-info .meta');
    if (metaEl) {
      metaEl.innerHTML = `${user.email || 'student@pict.edu'}<br>${user.branch || 'B.Tech CSE · 3rd year'}`;
    }

    // Wire rows
    const rows = document.querySelectorAll('.list-group .list-row');
    rows.forEach((row) => {
      const label = row.querySelector('.label')?.textContent.trim();

      if (label === 'Edit name and details') {
        row.href = 'javascript:void(0)';
        row.addEventListener('click', () => {
          showModal(
            'Edit Profile',
            `<div style="display:flex;flex-direction:column;gap:12px;">
               <div>
                 <label style="font-size:11px;color:var(--text-muted);">Full name</label>
                 <input id="edit-name" type="text" value="${user.name}" style="width:100%;padding:10px;background:var(--surface-raised);border:1px solid var(--border);color:#EBEAE6;border-radius:2px;font-family:'IBM Plex Mono';">
               </div>
               <div>
                 <label style="font-size:11px;color:var(--text-muted);">Branch & Year</label>
                 <input id="edit-branch" type="text" value="${user.branch || ''}" style="width:100%;padding:10px;background:var(--surface-raised);border:1px solid var(--border);color:#EBEAE6;border-radius:2px;font-family:'IBM Plex Mono';">
               </div>
             </div>`,
            'Save Changes',
            () => {
              const newName = document.getElementById('edit-name')?.value.trim();
              const newBranch = document.getElementById('edit-branch')?.value.trim();
              if (newName) {
                authStore.updateProfile({ name: newName, branch: newBranch });
                showToast('Profile updated!', 'teal');
                initProfile();
              }
            }
          );
        });
      } else if (label === 'Notification settings') {
        row.href = 'javascript:void(0)';
        row.addEventListener('click', () => {
          showModal(
            'Notification Settings',
            `<p>Receive SMS and alert nudges 10 minutes prior to session expiry and booking release.</p>
             <div style="margin-top:14px;color:var(--teal);">✓ In-app Alerts (Active)</div>
             <div style="margin-top:6px;color:var(--teal);">✓ SMS Reminders (Active)</div>`,
            'Close'
          );
        });
      } else if (label === 'Preferred zone') {
        row.href = 'javascript:void(0)';
        const valSpan = row.querySelector('.value');
        if (valSpan) valSpan.textContent = `${user.preferredZone || 'Silent zone'} ›`;

        row.addEventListener('click', () => {
          showModal(
            'Preferred Study Zone',
            `<div style="display:flex;flex-direction:column;gap:8px;">
               <label><input type="radio" name="zone" value="Silent zone" ${user.preferredZone === 'Silent zone' ? 'checked' : ''}> Silent zone</label>
               <label><input type="radio" name="zone" value="Near power" ${user.preferredZone === 'Near power' ? 'checked' : ''}> Near power stations</label>
               <label><input type="radio" name="zone" value="Window row" ${user.preferredZone === 'Window row' ? 'checked' : ''}> Window row</label>
             </div>`,
            'Save Preference',
            () => {
              const selected = document.querySelector('input[name="zone"]:checked')?.value;
              if (selected) {
                authStore.updateProfile({ preferredZone: selected });
                showToast(`Preferred zone set to ${selected}`, 'teal');
                initProfile();
              }
            }
          );
        });
      } else if (label === 'Report an issue') {
        row.href = 'javascript:void(0)';
        row.addEventListener('click', () => {
          showModal(
            'Report Seat Issue',
            `<p style="margin-bottom:10px;">Notice broken power sockets, missing chairs, or dirty desks?</p>
             <textarea id="issue-text" rows="3" placeholder="Describe the issue and seat number..." style="
               width:100%;padding:10px;background:var(--surface-raised);border:1px solid var(--border);
               color:#EBEAE6;border-radius:2px;font-family:'IBM Plex Mono';font-size:12px;outline:none;
             "></textarea>`,
            'Submit Report',
            () => {
              showToast('Issue report dispatched to library facilities team', 'teal');
            }
          );
        });
      } else if (label === 'Library seating policy') {
        row.href = 'javascript:void(0)';
        row.addEventListener('click', () => {
          showModal(
            'Library Seating Policy',
            `<ul style="padding-left:16px;display:flex;flex-direction:column;gap:8px;">
               <li><strong>10-Min QR Rule:</strong> You must check in at the desk within 10 minutes or the seat is auto-released.</li>
               <li><strong>5-Min Grace Period:</strong> You have 5 minutes to vacate when your session ends.</li>
               <li><strong>No Hoarding:</strong> Repeated no-shows temporarily limit reservation privileges.</li>
             </ul>`,
            'Understood'
          );
        });
      }
    });

    // Sign out
    const signoutBtn = document.querySelector('.signout');
    if (signoutBtn) {
      signoutBtn.href = 'javascript:void(0)';
      signoutBtn.addEventListener('click', () => {
        authStore.signOut();
        showToast('Signed out', 'amber');
        setTimeout(() => {
          window.location.href = 'signin.html';
        }, 400);
      });
    }
  }

  // 18. admin-login.html
  function initAdminLogin() {
    const fillBtn = document.getElementById('fill-demo-staff');
    if (fillBtn) {
      fillBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const idInp = document.getElementById('staff-id');
        const passInp = document.getElementById('password');
        if (idInp) idInp.value = 'LIB-0042';
        if (passInp) passInp.value = 'admin123';
        showToast('Demo credentials filled: LIB-0042 / admin123', 'teal');
      });
    }

    const form = document.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const staffId = document.getElementById('staff-id')?.value;
        const password = document.getElementById('password')?.value;

        const res = authStore.loginAdmin(staffId, password);
        if (res.success) {
          showToast('Staff authenticated. Redirecting...', 'teal');
          setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
          }, 200);
        } else {
          showToast(res.message || 'Staff login failed', 'red');
        }
      });
    }
  }

  // 19. admin-dashboard.html
  function initAdminDashboard() {
    const session = (typeof authStore !== 'undefined' && authStore.getAdminSession()) || null;
    if (!session || session.role !== 'admin') {
      if (typeof showToast === 'function') {
        showToast('Staff login required to access Admin Dashboard', 'red');
      }
      window.location.replace('admin-login.html');
      return;
    }

    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authStore.logoutAdmin();
        window.location.replace('admin-login.html');
      });
    }

    function refreshAdminData() {
      const allSeats = seatStore.getAll();
      const free = allSeats.filter(s => s.status === SEAT_STATUS.FREE).length;
      const occupied = allSeats.filter(s => s.status === SEAT_STATUS.OCCUPIED).length;
      const flagged = allSeats.filter(s => s.status === SEAT_STATUS.OVERSTAY).length;

      const statCards = document.querySelectorAll('.stat-grid .stat-card .num');
      if (statCards.length >= 3) {
        statCards[0].textContent = String(free);
        statCards[1].textContent = String(occupied);
        statCards[2].textContent = String(flagged);
      }

      // Render Alert feed (Overstay and Pending seats)
      const feed = document.querySelector('.alert-feed');
      if (feed) {
        const needsAttention = allSeats.filter(s => s.status === SEAT_STATUS.OVERSTAY || s.status === SEAT_STATUS.PENDING);
        if (needsAttention.length === 0) {
          feed.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--border);padding:16px;border-radius:2px;font-size:12px;color:var(--text-muted);text-align:center;">
              All quiet. No overstays or pending timeouts.
            </div>
          `;
        } else {
          feed.innerHTML = '';
          needsAttention.forEach((s) => {
            const isOverstay = s.status === SEAT_STATUS.OVERSTAY;
            const card = document.createElement('div');
            card.className = `alert-card ${isOverstay ? '' : 'amber-tone'}`;
            card.innerHTML = `
              <div class="left">
                <span class="seat">Seat ${s.id}</span>
                <span class="meta">${isOverstay ? 'Overstayed session · ' + s.zone : 'Booked hold, waiting QR check-in'}</span>
              </div>
              <span class="action" style="cursor:pointer;">${isOverstay ? 'Clear seat' : 'Watch'}</span>
            `;

            const actionBtn = card.querySelector('.action');
            actionBtn.addEventListener('click', () => {
              if (isOverstay) {
                seatStore.vacateSeat(s.id);
                showToast(`Staff cleared Seat ${s.id}`, 'teal');
                refreshAdminData();
              } else {
                showToast(`Monitoring hold on Seat ${s.id}`, 'amber');
              }
            });
            feed.appendChild(card);
          });
        }
      }

      // Render Mini-matrix
      const miniMatrix = document.querySelector('.mini-matrix');
      if (miniMatrix) {
        miniMatrix.innerHTML = '';
        allSeats.forEach((s) => {
          const seatEl = document.createElement('div');
          seatEl.className = `mini-seat ${s.status}`;
          seatEl.textContent = s.id;
          seatEl.style.cursor = 'pointer';
          seatEl.title = `Seat ${s.id} (${s.status})`;

          seatEl.addEventListener('click', () => {
            showModal(
              `Manage Seat ${s.id}`,
              `<p>Current Status: <strong style="color:var(--teal);">${s.status.toUpperCase()}</strong></p>
               <p style="font-size:12px;color:var(--text-muted);margin:8px 0;">Zone: ${s.zone}</p>
               <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
                 <button id="admin-free-btn" style="background:#1B2E2A;border:1px solid var(--teal);color:var(--teal);padding:8px 12px;border-radius:2px;cursor:pointer;font-family:'IBM Plex Mono';font-size:11px;">Set Free</button>
                 <button id="admin-maint-btn" style="background:#201F21;border:1px solid var(--border);color:var(--text-secondary);padding:8px 12px;border-radius:2px;cursor:pointer;font-family:'IBM Plex Mono';font-size:11px;">Maintenance</button>
               </div>`,
              'Close',
              null
            );

            setTimeout(() => {
              document.getElementById('admin-free-btn')?.addEventListener('click', () => {
                seatStore.update(s.id, { status: SEAT_STATUS.FREE, bookedBy: null, sessionEndsAt: null, bookedAt: null });
                showToast(`Seat ${s.id} set to FREE`, 'teal');
                const bd = document.getElementById('stacks-modal-backdrop');
                if (bd) bd.remove();
                else document.getElementById('modal-cancel-btn')?.click();
                refreshAdminData();
              });
              document.getElementById('admin-maint-btn')?.addEventListener('click', () => {
                seatStore.update(s.id, { status: SEAT_STATUS.MAINTENANCE, bookedBy: null, sessionEndsAt: null, bookedAt: null });
                showToast(`Seat ${s.id} marked MAINTENANCE`, 'amber');
                const bd = document.getElementById('stacks-modal-backdrop');
                if (bd) bd.remove();
                else document.getElementById('modal-cancel-btn')?.click();
                refreshAdminData();
              });
            }, 50);
          });

          miniMatrix.appendChild(seatEl);
        });
      }
    }

    refreshAdminData();

    // Wire tabbar links in admin dashboard
    const tabLinks = document.querySelectorAll('nav.tabbar a');
    tabLinks.forEach((tab) => {
      const text = tab.textContent.trim();
      if (text.includes('Seats')) {
        tab.href = 'matrix.html?role=admin';
      } else if (text.includes('Users')) {
        tab.href = 'javascript:void(0)';
        tab.addEventListener('click', () => {
          showModal('Registered Users', '<p>1 active student session (Ananya Rao, B.Tech CSE).<br>1 personnel account logged in.</p>');
        });
      } else if (text.includes('Reports')) {
        tab.href = 'javascript:void(0)';
        tab.addEventListener('click', () => {
          showModal('Patrol & Utilization Report', '<p>Occupancy rate: 68%<br>Average turnaround: 1 hr 45 min<br>No-show incidents today: 1</p>');
        });
      }
    });

    const viewAllLink = document.querySelector('.section-link');
    if (viewAllLink && viewAllLink.textContent.includes('view all')) {
      viewAllLink.href = 'matrix.html?role=admin';
    }
  }

  // ---- Bootstrap Dispatcher ----------------------------------------------

  function init() {
    initGlobalNavigation();

    const page = getPageName();

    switch (page) {
      case 'landing.html':
      case 'index.html':
        initLanding();
        break;
      case 'signin.html':
        initSignin();
        break;
      case 'signup.html':
        initSignup();
        break;
      case 'otp-verification.html':
        initOtpVerification();
        break;
      case 'onboarding.html':
        initOnboarding();
        break;
      case 'forgot-password.html':
        initForgotPassword();
        break;
      case 'dashboard.html':
        initDashboard();
        break;
      case 'matrix.html':
        initMatrix();
        break;
      case 'seat-detail.html':
        initSeatDetail();
        break;
      case 'booking-confirmation.html':
        initBookingConfirmation();
        break;
      case 'scan.html':
        initScan();
        break;
      case 'active-session.html':
        initActiveSession();
        break;
      case 'vacate-now.html':
        initVacateNow();
        break;
      case 'booking-expired.html':
        initBookingExpired();
        break;
      case 'history.html':
        initHistory();
        break;
      case 'notifications.html':
        initNotifications();
        break;
      case 'profile.html':
        initProfile();
        break;
      case 'admin-login.html':
        initAdminLogin();
        break;
      case 'admin-dashboard.html':
        initAdminDashboard();
        break;
    }
  }

  const AppControllers = {
    getQueryParam,
    getPageName,
    formatTimeDigits,
    formatMmSs,
    formatHms,
    formatClockTime,
    showToast,
    showModal,
    initGlobalNavigation,
    initLanding,
    initSignin,
    initSignup,
    initOtpVerification,
    initOnboarding,
    initForgotPassword,
    initDashboard,
    initMatrix,
    initSeatDetail,
    initBookingConfirmation,
    initScan,
    initActiveSession,
    initVacateNow,
    initBookingExpired,
    initHistory,
    initNotifications,
    initProfile,
    initAdminLogin,
    initAdminDashboard,
    init,
  };
  if (typeof window !== 'undefined') window.AppControllers = AppControllers;
  if (typeof globalThis !== 'undefined') globalThis.AppControllers = AppControllers;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
