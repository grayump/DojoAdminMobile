'use strict';

const App = (() => {
  let _data = null;
  let _page = 'members';
  let _memberSearch = '';
  let _detailView = null; // { type: 'member'|'rank'|'grading', id }

  // ── Bootstrap ────────────────────────────────

  function init() {
    const raw = localStorage.getItem('nrkd-snapshot');
    if (raw) {
      try {
        _data = JSON.parse(raw);
        _showApp();
        navigate('members');
      } catch {
        localStorage.removeItem('nrkd-snapshot');
        _showImport();
      }
    } else {
      _showImport();
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
      navigator.serviceWorker.ready.then(_setVersion).catch(() => {});
    }

    _setVersion();
  }

  function _setVersion() {
    if (!('caches' in window)) return;
    caches.keys().then(keys => {
      const key = keys.find(k => k.startsWith('nrkd-mobile-'));
      const el = document.getElementById('app-version');
      if (key && el) el.textContent = key;
    });
  }

  // ── Import ───────────────────────────────────

  function triggerImport() {
    document.getElementById('file-input').click();
  }

  function handleFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.members || !data.ranks || !data.gradingRows) {
          alert('This does not look like a valid NRKD snapshot file.');
          return;
        }
        localStorage.setItem('nrkd-snapshot', e.target.result);
        _data = data;
        _showApp();
        navigate('members');
      } catch {
        alert('Could not read the file. Make sure it is a valid NRKD snapshot JSON.');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  // ── Navigation ───────────────────────────────

  function navigate(page) {
    _page = page;
    _detailView = null;
    _memberSearch = '';
    _updateTabs();
    _updateHeader();
    _render();
  }

  function showImportScreen() {
    _showImport();
  }

  function goBack() {
    if (_detailView) {
      _detailView = null;
      _render();
    }
  }

  function viewMember(id) {
    _detailView = { type: 'member', id };
    _render();
  }

  function viewRank(id) {
    _detailView = { type: 'rank', id };
    _render();
  }

  function viewGrading(memberId) {
    _detailView = { type: 'grading', id: memberId };
    _render();
  }

  function onMemberSearch(val) {
    _memberSearch = val;
    const list = document.getElementById('member-list');
    if (list) list.innerHTML = _memberListItems();
  }

  function _showApp() {
    document.getElementById('import-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
  }

  function _showImport() {
    _updateImportInfo();
    document.getElementById('import-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }

  function _updateImportInfo() {
    const el = document.getElementById('import-info');
    if (!el) return;
    if (_data) {
      const d = new Date(_data.exportedAt);
      const fmt = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      el.innerHTML = `<div class="import-info-label">Current data</div>${_data.members.length} members &bull; exported ${fmt}<span class="import-info-open">Open &#8250;</span>`;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function openCurrentData() {
    if (!_data) return;
    _showApp();
    navigate('members');
  }

  function _updateTabs() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === _page);
    });
  }

  function _updateHeader() {
    const titles = { members: 'Members', grading: 'Grading', curriculum: 'Ranks & Curriculum' };
    const el = document.getElementById('page-title');
    if (el) el.textContent = titles[_page] ?? '';
  }

  // ── Render dispatcher ────────────────────────

  function _render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    if (_detailView?.type === 'member') {
      main.innerHTML = _renderMemberDetail(_detailView.id);
    } else if (_detailView?.type === 'rank') {
      main.innerHTML = _renderRankDetail(_detailView.id);
    } else if (_detailView?.type === 'grading') {
      main.innerHTML = _renderGradingDetail(_detailView.id);
    } else if (_page === 'members') {
      main.innerHTML = _renderMembers();
    } else if (_page === 'grading') {
      main.innerHTML = _renderGrading();
    } else if (_page === 'curriculum') {
      main.innerHTML = _renderCurriculum();
    }

    main.scrollTop = 0;
  }

  // ── Members ──────────────────────────────────

  function _renderMembers() {
    return `
      <div class="search-wrap">
        <input type="search" id="member-search" class="search-input"
               placeholder="Search members…"
               value="${_esc(_memberSearch)}"
               oninput="App.onMemberSearch(this.value)"
               autocorrect="off" autocapitalize="none" spellcheck="false">
      </div>
      <div id="member-list">
        ${_memberListItems()}
      </div>
      `
        ;
  }

  function _memberListItems() {
    const members = _filteredMembers();
    if (members.length === 0) return '<div class="empty-state">No members match your search</div>';
    return members.map(m => `
      <button class="list-item" onclick="App.viewMember(${m.id})">
        <div class="list-item-body">
          <div class="list-item-main">
            <span class="list-item-name">${_esc(m.sortName)}</span>
            ${m.isJunior ? '<span class="badge badge-junior">Junior</span>' : ''}
            ${m.isSensei ? '<span class="badge badge-sensei">Sensei</span>' : ''}
          </div>
          <div class="list-item-sub">${m.currentRankName ? _esc(m.currentRankName) + (m.currentRankColorDisplay ? ' &middot; ' + _esc(m.currentRankColorDisplay) : '') : 'No rank recorded'}</div>
        </div>
        <span class="list-arrow">&#8250;</span>
      </button>`).join('');
  }

  function _filteredMembers() {
    const sorted = _data.members.slice().sort((a, b) => a.sortName.localeCompare(b.sortName));
    if (!_memberSearch) return sorted;
    const q = _memberSearch.toLowerCase();
    return sorted.filter(m =>
      m.fullName.toLowerCase().includes(q) ||
      (m.currentRankName?.toLowerCase().includes(q))
    );
  }

  function _renderMemberDetail(id) {
    const m = _data.members.find(x => x.id === id);
    if (!m) return '<div class="empty-state">Member not found</div>';

    const hasEmergency = m.emergencyContactName || m.emergencyContactPhone;

    return `
      <div class="detail-back">
        <button class="back-btn" onclick="App.goBack()">
          ${_chevronLeft()} Members
        </button>
      </div>
      <div class="detail-hero">
        <div class="detail-name">
          ${_esc(m.fullName)}
          ${m.isJunior ? '<span class="badge badge-junior">Junior</span>' : ''}
          ${m.isSensei ? '<span class="badge badge-sensei">Sensei</span>' : ''}
        </div>
        <div class="detail-rank">
          ${m.currentRankName
            ? `<strong>${_esc(m.currentRankName)}</strong>${m.currentRankColorDisplay ? ' &middot; ' + _esc(m.currentRankColorDisplay) : ''}${m.promotedOn ? ' &middot; since ' + m.promotedOn : ''}`
            : 'No rank recorded'}
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-label">Personal</div>
        ${_drow('Joined', m.joinDate)}
        ${_drow('Phone', m.phone)}
        ${_drow('Email', m.email)}
        ${_drow('Address', m.address)}
      </div>
      ${hasEmergency ? `
      <div class="detail-section">
        <div class="detail-section-label">Emergency Contact</div>
        ${_drow('Name', m.emergencyContactName)}
        ${_drow('Phone', m.emergencyContactPhone)}
      </div>` : ''}`;
  }

  function _drow(label, value) {
    if (!value) return '';
    return `<div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${_esc(value)}</span>
    </div>`;
  }

  // ── Grading ──────────────────────────────────

  function _renderGrading() {
    const rows = _data.gradingRows.slice()
      .sort((a, b) => a.memberSortName.localeCompare(b.memberSortName));
    const eligible = rows.filter(r => r.isEligible);
    const notYet = rows.filter(r => !r.isEligible);

    if (rows.length === 0) return '<div class="empty-state">No grading data available</div>';

    return `
      ${eligible.length > 0 ? `
        <div class="grading-section-header eligible">
          <span class="grading-dot eligible"></span>
          Ready for Grading (${eligible.length})
        </div>
        ${eligible.map(_gradingCard).join('')}
      ` : `<div class="empty-state" style="padding-top:2rem">No members are currently eligible for grading</div>`}

      ${notYet.length > 0 ? `
        <div class="grading-section-header not-eligible" style="margin-top:${eligible.length ? '1rem' : '0'}">
          <span class="grading-dot not-eligible"></span>
          Not Yet Eligible (${notYet.length})
        </div>
        ${notYet.map(_gradingCard).join('')}
      ` : ''}`;
  }

  function _gradingCard(row) {
    return `
      <button class="grading-card" onclick="App.viewGrading(${row.memberId})">
        <div class="grading-member-name">
          ${_esc(row.memberFullName)}
          ${row.isJunior ? '<span class="badge badge-junior">Junior</span>' : ''}
          ${_stripeMarkers(row)}
        </div>
        ${row.currentRankName ? `<div class="grading-current-rank">${_esc(row.currentRankName)}</div>` : ''}
        <div class="grading-next-rank">
          Training for: ${_esc(row.nextRankName)}${row.nextRankColorDisplay ? ' (' + _esc(row.nextRankColorDisplay) + ')' : ''}
        </div>
        <div class="grading-checks">
          ${_pill(row.requirementsMet, `${row.signedOff}/${row.totalRequirements} reqs`)}
          ${_pill(row.timeMet, `${row.monthsInRank}/${row.minMonths} mo`)}
          ${_pill(row.attendanceMet, `${row.attendanceSincePromotion}/${row.minAttendance} classes`)}
          ${row.juniorStripeCount > 0 ? _pill(row.juniorStripesMet, `${row.juniorStripesRemoved}/${row.juniorStripeCount} stripes`) : ''}
        </div>
      </button>`;
  }

  function _pill(ok, label) {
    return `<span class="check-pill ${ok ? 'ok' : 'fail'}">${_statusIcon(ok)}${_esc(label)}</span>`;
  }

  function _statusIcon(ok) {
    return ok
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`;
  }

  function _stripeMarkers(row) {
    if (!row.isJunior || !(row.juniorStripeCount > 0)) return '';
    const total = row.juniorStripeCount;
    const remaining = Math.max(0, total - row.juniorStripesRemoved);
    let pips = '';
    for (let i = 0; i < total; i++) {
      const present = i < remaining;
      pips += `<span class="stripe-mark ${present ? 'remaining' : 'removed'}">${_stripePip(present)}</span>`;
    }
    const label = `${remaining} of ${total} stripes remaining`;
    return `<span class="stripe-marks" title="${label}" aria-label="${label}">${pips}</span>`;
  }

  function _stripePip(filled) {
    return filled
      ? `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>`;
  }

  function _stripePill(row) {
    if (!(row.juniorStripeCount > 0)) return '';
    const remaining = Math.max(0, row.juniorStripeCount - row.juniorStripesRemoved);
    const label = row.juniorStripesMet ? 'All cleared' : `${remaining} of ${row.juniorStripeCount} remaining`;
    return _pill(row.juniorStripesMet, label);
  }

  function _renderGradingDetail(memberId) {
    const row = _data.gradingRows.find(r => r.memberId === memberId);
    if (!row) return '<div class="empty-state">Member not found</div>';

    const rank = _data.ranks.find(r => r.id === row.nextRankId);
    const signedOff = row.signedOffRequirementIds || [];

    const grouped = {};
    (rank?.requirements || []).forEach(r => {
      const key = r.categoryDisplay || r.category;
      (grouped[key] = grouped[key] || []).push(r);
    });

    return `
      <div class="detail-back">
        <button class="back-btn" onclick="App.goBack()">
          ${_chevronLeft()} Grading
        </button>
      </div>
      <div class="detail-hero">
        <div class="detail-name">
          ${_esc(row.memberFullName)}
          ${row.isJunior ? '<span class="badge badge-junior">Junior</span>' : ''}
          ${_stripeMarkers(row)}
        </div>
        <div class="detail-rank">
          Training for: <strong>${_esc(row.nextRankName)}</strong>${row.nextRankColorDisplay ? ' &middot; ' + _esc(row.nextRankColorDisplay) : ''}
        </div>
      </div>
      <div class="grading-checks">
        ${_pill(row.requirementsMet, `${row.signedOff}/${row.totalRequirements} reqs`)}
        ${_pill(row.timeMet, `${row.monthsInRank}/${row.minMonths} mo`)}
        ${_pill(row.attendanceMet, `${row.attendanceSincePromotion}/${row.minAttendance} classes`)}
        ${row.juniorStripeCount > 0 ? _pill(row.juniorStripesMet, `${row.juniorStripesRemoved}/${row.juniorStripeCount} stripes`) : ''}
      </div>
      ${Object.keys(grouped).length === 0
        ? '<div class="no-reqs">No requirements defined for this rank</div>'
        : Object.entries(grouped).map(([cat, reqs]) => `
          <div class="req-group">
            <div class="req-group-label">${_esc(cat)}</div>
            ${reqs.map(r => {
              const done = signedOff.includes(r.id);
              return `
              <div class="req-item">
                <span class="req-status ${done ? 'done' : 'pending'}">${_statusIcon(done)}</span>
                <span class="req-text">
                  ${r.subcategory ? `<span class="req-sub">${_esc(r.subcategory)}</span>` : ''}
                  ${_esc(r.description)}
                </span>
              </div>`;
            }).join('')}
          </div>`).join('')}`;
  }

  // ── Curriculum ───────────────────────────────

  function _renderCurriculum() {
    const kyu = _data.ranks.filter(r => r.category === 'kyu').sort((a, b) => a.position - b.position);
    const dan = _data.ranks.filter(r => r.category === 'dan').sort((a, b) => a.position - b.position);

    return `
      ${kyu.length > 0 ? `
        <div class="list-section-label">Kyu Grades</div>
        ${kyu.map(_rankListItem).join('')}
      ` : ''}
      ${dan.length > 0 ? `
        <div class="list-section-label">Dan Grades</div>
        ${dan.map(_rankListItem).join('')}
      ` : ''}`;
  }

  function _rankListItem(rank) {
    const reqCount = rank.requirements.length;
    const parts = [];
    if (reqCount > 0) parts.push(`${reqCount} requirement${reqCount !== 1 ? 's' : ''}`);
    if (rank.minTimeInRankMonths) parts.push(`${rank.minTimeInRankMonths} mo min`);
    if (rank.minAttendanceCount) parts.push(`${rank.minAttendanceCount} classes min`);
    return `
      <button class="list-item" onclick="App.viewRank(${rank.id})">
        <div class="list-item-body">
          <div class="list-item-main">
            <span class="list-item-name">${_esc(rank.name)}</span>
          </div>
          <div class="list-item-sub">${rank.colorDisplay ? _esc(rank.colorDisplay) + (parts.length ? ' &middot; ' : '') : ''}${parts.join(' &middot; ')}</div>
        </div>
        <span class="list-arrow">&#8250;</span>
      </button>`;
  }

  function _renderRankDetail(id) {
    const rank = _data.ranks.find(r => r.id === id);
    if (!rank) return '<div class="empty-state">Rank not found</div>';

    const grouped = {};
    rank.requirements.forEach(r => {
      const key = r.categoryDisplay || r.category;
      (grouped[key] = grouped[key] || []).push(r);
    });

    const thresholdParts = [];
    if (rank.minTimeInRankMonths) thresholdParts.push(`${rank.minTimeInRankMonths} months min time`);
    if (rank.minAttendanceCount) thresholdParts.push(`${rank.minAttendanceCount} classes min attendance`);

    return `
      <div class="detail-back">
        <button class="back-btn" onclick="App.goBack()">
          ${_chevronLeft()} ${_page === 'grading' ? 'Grading' : 'Ranks'}
        </button>
      </div>
      <div class="detail-hero">
        <div class="detail-name">${_esc(rank.name)}</div>
        ${rank.colorDisplay ? `<div class="detail-rank"><strong>${_esc(rank.colorDisplay)}</strong></div>` : ''}
      </div>
      ${thresholdParts.length > 0 ? `<div class="rank-thresholds">${thresholdParts.join(' &middot; ')}</div>` : ''}
      ${Object.keys(grouped).length === 0
        ? '<div class="no-reqs">No requirements defined for this rank</div>'
        : Object.entries(grouped).map(([cat, reqs]) => `
          <div class="req-group">
            <div class="req-group-label">${_esc(cat)}</div>
            ${reqs.map(r => `
              <div class="req-item">
                ${r.subcategory ? `<span class="req-sub">${_esc(r.subcategory)}</span>` : ''}
                ${_esc(r.description)}
              </div>`).join('')}
          </div>`).join('')}`;
  }

  // ── Utilities ────────────────────────────────

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _chevronLeft() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  }

  // ── Public API ───────────────────────────────

  return {
    init,
    triggerImport,
    handleFile,
    navigate,
    showImportScreen,
    openCurrentData,
    goBack,
    viewMember,
    viewRank,
    viewGrading,
    onMemberSearch,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
