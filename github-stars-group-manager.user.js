// ==UserScript==
// @name         GitHub Stars Group Manager
// @namespace    https://github.com/yuyunzhi2
// @version      1.1.0
// @description  为 GitHub Stars 页面添加分组管理功能，支持自动推荐分组、Tab 切换、搜索筛选、JSON 导入导出
// @author       yuyunzhi2
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- DEBUG: confirm script execution ---
  console.log('[SGM] Script loaded! URL=' + location.href);

  // --- Constants ---
  const API_BASE = 'https://api.github.com';
  const PER_PAGE = 100; // GitHub API max per page
  const STORAGE_KEYS = {
    GROUPS: 'star_groups',
    CACHE: 'star_cache',
    SETTINGS: 'star_settings',
    RULES: 'star_auto_rules',
  };

  // --- Utility: unique ID generator (prevents Date.now() collision in fast loops) ---
  let _idCounter = 0;
  function generateId() {
    return 'g-' + Date.now().toString(36) + '-' + (++_idCounter).toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // --- Utility: safe URL/color helpers (prevent XSS) ---
  function safeUrl(url) {
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) return url;
    return '#';
  }
  function safeColor(color) {
    if (/^#[0-9a-fA-F]{3,8}$/.test(color || '')) return color;
    return '#58a6ff'; // default
  }
  function normalizeRepo(repo) {
    return {
      full_name: repo.full_name || '',
      name: repo.name || '',
      owner: repo.owner?.login || (repo.full_name || '').split('/')[0],
      description: repo.description || '',
      language: repo.language || '',
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      stargazers_count: repo.stargazers_count || 0,
      html_url: repo.html_url || '',
      updated_at: repo.updated_at || repo.pushed_at || '',
      archived: !!repo.archived,
    };
  }

  // =========================================================================
  // Task 2: StorageManager
  // =========================================================================
  class StorageManager {
    constructor() {
      this._cache = {};
    }

    get(key, defaultValue = null) {
      if (this._cache[key] !== undefined) return this._cache[key];
      const value = GM_getValue(key, defaultValue);
      this._cache[key] = value;
      return value;
    }

    set(key, value) {
      this._cache[key] = value;
      GM_setValue(key, value);
    }

    remove(key) {
      delete this._cache[key];
      GM_deleteValue(key);
    }

    // Group operations
    getGroups() {
      return this.get(STORAGE_KEYS.GROUPS, { groups: {}, version: 1 });
    }

    saveGroups(groups) {
      this.set(STORAGE_KEYS.GROUPS, groups);
    }

    // Cache operations
    getCache() {
      return this.get(STORAGE_KEYS.CACHE, { repos: [], fetched_at: 0, total_count: 0 });
    }

    saveCache(cache) {
      this.set(STORAGE_KEYS.CACHE, cache);
    }

    isCacheExpired(maxAgeMs = 24 * 60 * 60 * 1000) {
      const cache = this.getCache();
      return !cache.fetched_at || (Date.now() - cache.fetched_at > maxAgeMs);
    }

    // Settings operations
    getSettings() {
      return this.get(STORAGE_KEYS.SETTINGS, {
        github_token: '',
        items_per_page: 30,
        sort_by: 'updated',
        sort_order: 'desc',
        username: '',
      });
    }

    saveSettings(settings) {
      this.set(STORAGE_KEYS.SETTINGS, settings);
    }

    // Auto group rules
    getAutoRules() {
      return this.get(STORAGE_KEYS.RULES, null);
    }

    saveAutoRules(rules) {
      this.set(STORAGE_KEYS.RULES, rules);
    }
  }
console.log('[SGM] Class StorageManager defined OK');

  // =========================================================================
  // Task 3: APIFetcher
  // =========================================================================
  class APIFetcher {
    constructor(storage) {
      this.storage = storage;
    }

    /**
     * Fetch all starred repos for a user via GitHub API with pagination.
     * GET /users/{username}/starred?per_page=100&page=N
     * Returns array of simplified repo objects.
     */
    async fetchAllStars(username, token = '', onProgress = null) {
      const repos = [];
      let page = 1;
      let hasMore = true;

      console.log('[SGM] fetchAllStars — username:', username, 'hasToken:', !!token);

      while (hasMore) {
        const url = `${API_BASE}/users/${encodeURIComponent(username)}/starred?per_page=${PER_PAGE}&page=${page}&sort=updated&direction=desc`;
        console.log('[SGM] Fetching page', page, '...');

        const headers = {
          'Accept': 'application/vnd.github.v3+json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await this._request(url, headers);

        if (!response.ok) {
          const error = new Error(`API error: ${response.status} ${response.statusText}`);
          error.status = response.status;
          error.data = response.data;
          throw error;
        }

        const items = response.data;
        if (!items || items.length === 0) {
          hasMore = false;
        } else {
          const simplified = items.map(this._simplifyRepo);
          repos.push(...simplified);
          if (onProgress) onProgress(repos.length);
          hasMore = items.length === PER_PAGE;
          page++;
        }
      }

      return repos;
    }

    /**
     * Simplify API repo response to only needed fields.
     */
    _simplifyRepo(repo) {
      return {
        full_name: repo.full_name,
        name: repo.name,
        owner: repo.owner?.login || (repo.full_name || '').split('/')[0],
        description: repo.description || '',
        language: repo.language || '',
        topics: repo.topics || [],
        stargazers_count: repo.stargazers_count || 0,
        html_url: repo.html_url,
        updated_at: repo.updated_at || repo.pushed_at || '',
        archived: repo.archived || false,
      };
    }

    /**
     * Make a GM_xmlhttpRequest and return parsed JSON with rate limit info.
     */
    _request(url, headers = {}) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          headers: headers,
          onload: (response) => {
            // Extract rate limit info from response headers
            const headerStr = response.responseHeaders || '';
            const getHeader = (name) => {
              const match = headerStr.match(new RegExp(name + ':\\s*(\\d+)', 'i'));
              return match ? parseInt(match[1]) : 0;
            };
            this._lastRateLimit = {
              remaining: getHeader('x-ratelimit-remaining'),
              limit: getHeader('x-ratelimit-limit'),
              reset: getHeader('x-ratelimit-reset'),
            };

            if (response.status >= 200 && response.status < 300) {
              let data;
              try {
                data = JSON.parse(response.responseText);
              } catch (e) {
                data = [];
              }
              resolve({ ok: true, status: response.status, data: data });
            } else {
              let data;
              try {
                data = JSON.parse(response.responseText);
              } catch (e) {
                data = null;
              }
              // Provide helpful message for rate limit errors
              let statusText = response.statusText || '';
              if (response.status === 403 && this._lastRateLimit.remaining === 0) {
                const resetTime = new Date(this._lastRateLimit.reset * 1000);
                statusText = `API 速率限制已耗尽，请等待至 ${resetTime.toLocaleTimeString()}`;
              }
              resolve({ ok: false, status: response.status, statusText, data: data });
            }
          },
          onerror: (error) => {
            reject(new Error(`Network error: ${error.statusText || 'Unknown error'}`));
          },
          ontimeout: () => {
            reject(new Error('Request timeout'));
          },
        });
      });
    }

    /**
     * Validate a GitHub token by making a test API call.
     */
    async validateToken(token) {
      const url = `${API_BASE}/user`;
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
      };
      const response = await this._request(url, headers);
      return response.ok;
    }
  }
console.log('[SGM] Class APIFetcher defined OK');

  // =========================================================================
  // Task 4: GroupManager
  // =========================================================================
  class GroupManager {
    constructor(storage) {
      this.storage = storage;
      this._groups = null;
      this._dirty = false;  // dirty flag: defer GM_setValue writes until flush()
    }

    /**
     * Load groups from storage (with in-memory cache).
     */
    load() {
      if (!this._groups) {
        this._groups = this.storage.getGroups();
      }
      return this._groups;
    }

    /**
     * Mark groups as dirty (will be persisted on flush()).
     */
    save() {
      this._dirty = true;
    }

    /**
     * Flush dirty groups to GM_setValue (actual write).
     * Call this after a batch of operations or a single user action.
     */
    flush() {
      if (this._dirty) {
        this.storage.saveGroups(this._groups);
        this._dirty = false;
      }
    }

    /**
     * Get all groups as a Map.
     */
    getAll() {
      return this.load().groups;
    }

    /**
     * Create a new group.
     * @param {string} name - Group display name
     * @param {string} color - CSS color string
     * @returns {string} group id
     */
    createGroup(name, color = '#58a6ff') {
      const id = generateId();
      this.load().groups[id] = { name, color, repos: [] };
      this.save();
      return id;
    }

    /**
     * Delete a group by id.
     */
    deleteGroup(groupId) {
      delete this.load().groups[groupId];
      this.save();
    }

    /**
     * Rename a group.
     */
    renameGroup(groupId, newName) {
      const group = this.load().groups[groupId];
      if (group) {
        group.name = newName;
        this.save();
      }
    }

    /**
     * Change group color.
     */
    setGroupColor(groupId, color) {
      const group = this.load().groups[groupId];
      if (group) {
        group.color = color;
        this.save();
      }
    }

    /**
     * Add a repo (full_name) to a group. Returns true if added, false if already exists.
     * Enforces single-group constraint: removes from any other group first.
     */
    addRepoToGroup(groupId, full_name) {
      const group = this.load().groups[groupId];
      if (!group) return false;
      if (group.repos.includes(full_name)) return false;
      // Enforce single-group constraint: remove from other groups
      this.removeRepoFromAll(full_name);
      group.repos.push(full_name);
      this.save();
      return true;
    }

    /**
     * Remove a repo from a group.
     */
    removeRepoFromGroup(groupId, full_name) {
      const group = this.load().groups[groupId];
      if (!group) return false;
      const idx = group.repos.indexOf(full_name);
      if (idx === -1) return false;
      group.repos.splice(idx, 1);
      this.save();
      return true;
    }

    /**
     * Remove a repo from ALL groups.
     */
    removeRepoFromAll(full_name) {
      const groups = this.getAll();
      for (const id in groups) {
        const idx = groups[id].repos.indexOf(full_name);
        if (idx !== -1) {
          groups[id].repos.splice(idx, 1);
        }
      }
      this.save();
    }

    /**
     * Move a repo from one group to another.
     */
    moveRepo(full_name, fromGroupId, toGroupId) {
      this.removeRepoFromGroup(fromGroupId, full_name);
      this.addRepoToGroup(toGroupId, full_name);
    }

    /**
     * Batch add repos to a group.
     */
    batchAddToGroup(groupId, fullNames) {
      const group = this.load().groups[groupId];
      if (!group) return 0;
      let count = 0;
      for (const fn of fullNames) {
        if (!group.repos.includes(fn)) {
          group.repos.push(fn);
          count++;
        }
      }
      this.save();
      return count;
    }

    /**
     * Get the group id that a repo belongs to. Returns null if ungrouped.
     * A repo can belong to at most one group in this design.
     */
    getRepoGroup(full_name) {
      const groups = this.getAll();
      for (const id in groups) {
        if (groups[id].repos.includes(full_name)) return id;
      }
      return null;
    }

    /**
     * Get all repos in a specific group.
     */
    getGroupRepos(groupId) {
      const group = this.getAll()[groupId];
      return group ? group.repos : [];
    }

    /**
     * Get count of repos in a group.
     */
    getGroupCount(groupId) {
      return this.getGroupRepos(groupId).length;
    }

    /**
     * Import groups from external data (merge or overwrite).
     * @param {object} importedGroups - { groups: { id: { name, color, repos } } }
     * @param {string} mode - 'overwrite' | 'merge'
     */
    importGroups(importedGroups, mode = 'overwrite') {
      if (mode === 'overwrite') {
        this._groups = { groups: importedGroups.groups || {}, version: 1 };
        this.save();
      } else {
        // Merge: combine repos for groups with same name, create new groups for new names
        const existing = this.getAll();
        const imported = importedGroups.groups || {};

        // Build name -> id map for existing groups
        const nameMap = {};
        for (const id in existing) {
          nameMap[existing[id].name.toLowerCase()] = id;
        }

        for (const id in imported) {
          const group = imported[id];
          const existingId = nameMap[group.name.toLowerCase()];
          if (existingId) {
            // Merge repos (union)
            for (const repo of group.repos) {
              if (!existing[existingId].repos.includes(repo)) {
                existing[existingId].repos.push(repo);
              }
            }
          } else {
            // Create new group with new id
            const newId = generateId();
            existing[newId] = { name: group.name, color: group.color, repos: [...group.repos] };
          }
        }
        this.save();
      }
    }

    /**
     * Export current groups as plain object.
     */
    exportGroups() {
      return JSON.parse(JSON.stringify(this.load()));
    }
  }
console.log('[SGM] Class GroupManager defined OK');

  // =========================================================================
  // Task 5: AutoGrouper
  // =========================================================================
  class AutoGrouper {
    constructor(storage) {
      this.storage = storage;
    }

    /**
     * Get default group rules.
     */
    getDefaultRules() {
      return [
        {
          name: 'AI / LLM',
          keywords: ['llm', 'gpt', 'transformer', 'language model', 'openai',
                     'chatgpt', 'machine learning', 'deep learning', 'nlp',
                     'diffusion', 'stable diffusion', 'midjourney', 'copilot',
                     'embedding', 'rag', 'agent', 'prompt', 'fine-tune',
                     'artificial intelligence'],
          topics: ['llm', 'ai', 'machine-learning', 'nlp', 'deep-learning', 'generative-ai'],
        },
        {
          name: '前端开发',
          keywords: ['react', 'vue', 'angular', 'css', 'javascript', 'typescript',
                     'frontend', 'component', 'svelte', 'next.js', 'nuxt',
                     'tailwind', 'webpack', 'vite', 'sass'],
          topics: ['react', 'vue', 'angular', 'javascript', 'typescript', 'css', 'svelte', 'frontend'],
        },
        {
          name: '后端开发',
          keywords: ['api', 'server', 'backend', 'database', 'redis', 'postgres',
                     'microservice', 'rest', 'graphql', 'django', 'flask', 'express',
                     'fastapi', 'spring', 'rails', 'laravel'],
          topics: ['api', 'server', 'database', 'redis', 'postgresql', 'backend'],
        },
        {
          name: '开发工具',
          keywords: ['cli', 'utility', 'extension', 'plugin', 'vim',
                     'neovim', 'vscode', 'editor', 'terminal', 'shell', 'devtools',
                     'productivity', 'automation'],
          topics: ['cli', 'tools', 'vim', 'vscode', 'terminal', 'developer-tools'],
        },
        {
          name: '学习资源',
          keywords: ['tutorial', 'course', 'learning', 'education', 'book',
                     'awesome', 'cheatsheet', 'guide', 'handbook', 'roadmap',
                     'interview', 'coding-interview'],
          topics: ['tutorial', 'learning', 'education'],
        },
        {
          name: '数据科学',
          keywords: ['pandas', 'numpy', 'jupyter', 'notebook', 'visualization',
                     'matplotlib', 'plotly', 'analytics', 'dataframe', 'spark'],
          topics: ['data-science', 'jupyter', 'visualization', 'data-analysis'],
        },
        {
          name: 'DevOps / 基础设施',
          keywords: ['docker', 'kubernetes', 'k8s', 'devops', 'ci/cd', 'terraform',
                     'ansible', 'linux', 'nginx', 'deploy', 'cloud'],
          topics: ['docker', 'kubernetes', 'devops', 'cloud', 'infrastructure'],
        },
        {
          name: '安全',
          keywords: ['security', 'pentest', 'vulnerability', 'exploit', 'crypto',
                     'encryption', 'firewall', 'malware', 'forensic'],
          topics: ['security', 'pentesting', 'cryptography'],
        },
      ];
    }

    /**
     * Get current rules (custom or default).
     */
    getRules() {
      const custom = this.storage.getAutoRules();
      return custom || this.getDefaultRules();
    }

    /**
     * Save custom rules.
     */
    saveRules(rules) {
      this.storage.saveAutoRules(rules);
    }

    /**
     * Reset rules to defaults.
     */
    resetRules() {
      this.storage.saveAutoRules(null); // null = use defaults
    }

    /**
     * Auto-group a list of repos based on rules.
     * Returns { suggestions: { groupName: [full_name, ...] }, ungrouped: [full_name, ...] }
     */
    suggestGroups(repos, rules = null) {
      const activeRules = rules || this.getRules();
      const suggestions = {};
      const ungrouped = [];

      // Initialize suggestion groups
      for (const rule of activeRules) {
        suggestions[rule.name] = [];
      }

      for (const repo of repos) {
        const scores = [];

        const searchText = [
          repo.full_name,
          repo.description,
          ...(repo.topics || []),
        ].join(' ').toLowerCase();

        for (const rule of activeRules) {
          let score = 0;

          // Topic match (high weight)
          for (const topic of repo.topics || []) {
            if (rule.topics.includes(topic.toLowerCase())) {
              score += 10;
            }
          }

          // Keyword match in text (word boundary to prevent substring false matches)
          for (const keyword of rule.keywords) {
            const kw = keyword.toLowerCase();
            // Use word boundary check: match keyword as a whole word or word part
            // e.g. "api" should not match "canvas", "css" should not match "accessibility"
            const boundary = new RegExp('(?:^|[\\s/\\-_.,:;|()\\[\\]{}])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[\\s/\\-_.,:;|()\\[\\]{}])', 'i');
            if (boundary.test(searchText)) {
              score += 3;
            }
          }

          if (score > 0) {
            scores.push({ name: rule.name, score });
          }
        }

        // Sort by score descending, pick highest
        scores.sort((a, b) => b.score - a.score);
        if (scores.length > 0 && scores[0].score >= 3) {
          suggestions[scores[0].name].push(repo.full_name);
        } else {
          ungrouped.push(repo.full_name);
        }
      }

      // Remove empty suggestion groups
      for (const name of Object.keys(suggestions)) {
        if (suggestions[name].length === 0) {
          delete suggestions[name];
        }
      }

      return { suggestions, ungrouped };
    }

    /**
     * Apply suggestions to GroupManager, creating groups as needed.
     * @param {object} suggestions - { groupName: [full_name, ...] }
     * @param {GroupManager} groupManager
     * @param {string[]} ungrouped - repos to clear from all groups first (optional)
     * @returns {object} { applied: { groupName: groupId }, count: number }
     */
    applySuggestions(suggestions, groupManager, clearExisting = false) {
      if (clearExisting) {
        // Collect all repo names from suggestions
        const allRepos = Object.values(suggestions).flat();
        for (const repo of allRepos) {
          groupManager.removeRepoFromAll(repo);
        }
      }

      const applied = {};
      let count = 0;

      for (const groupName of Object.keys(suggestions)) {
        const repos = suggestions[groupName];
        if (repos.length === 0) continue;

        // Find existing group with this name
        let groupId = null;
        const groups = groupManager.getAll();
        for (const id in groups) {
          if (groups[id].name === groupName) {
            groupId = id;
            break;
          }
        }

        // Create new group if needed
        if (!groupId) {
          groupId = groupManager.createGroup(groupName);
        }

        groupManager.batchAddToGroup(groupId, repos);
        applied[groupName] = groupId;
        count += repos.length;
      }

      return { applied, count };
    }
  }
console.log('[SGM] Class AutoGrouper defined OK');

  // =========================================================================
  // Task 6: SearchFilter
  // =========================================================================
  class SearchFilter {
    constructor() {
      this.query = '';
      this.language = '';      // '' = all
      this.groupFilter = null; // null = all groups (show "All"), string = specific groupId, '__none__' = ungrouped
    }

    /**
     * Filter and sort repos based on current criteria.
     * @param {Array} repos - all repo objects from cache
     * @param {GroupManager} groupManager
     * @param {object} sortConfig - { by: 'updated'|'name'|'stars', order: 'asc'|'desc' }
     * @returns {Array} filtered and sorted repos
     */
    apply(repos, groupManager, sortConfig) {
      let result = [...repos];

      // Group filter
      if (this.groupFilter !== null) {
        if (this.groupFilter === '__none__') {
          // Show only ungrouped repos
          result = result.filter(r => groupManager.getRepoGroup(r.full_name) === null);
        } else {
          // Show repos in specific group
          const groupRepos = new Set(groupManager.getGroupRepos(this.groupFilter));
          result = result.filter(r => groupRepos.has(r.full_name));
        }
      }

      // Language filter
      if (this.language) {
        result = result.filter(r => r.language === this.language);
      }

      // Search query
      if (this.query) {
        const q = this.query.toLowerCase();
        result = result.filter(r =>
          r.full_name.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.topics || []).some(t => t.toLowerCase().includes(q)) ||
          (r.language && r.language.toLowerCase().includes(q))
        );
      }

      // Sort
      const { by, order } = sortConfig || { by: 'updated', order: 'desc' };
      result.sort((a, b) => {
        let valA, valB;
        switch (by) {
          case 'name':
            valA = a.full_name.toLowerCase();
            valB = b.full_name.toLowerCase();
            return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          case 'stars':
            valA = a.stargazers_count;
            valB = b.stargazers_count;
            break;
          case 'updated':
          default:
            valA = a.updated_at;
            valB = b.updated_at;
            break;
        }
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
      });

      return result;
    }

    /**
     * Get unique languages from repo list (for dropdown).
     */
    static getUniqueLanguages(repos) {
      const langs = new Set();
      for (const repo of repos) {
        if (repo.language) langs.add(repo.language);
      }
      return [...langs].sort();
    }
  }
console.log('[SGM] Class SearchFilter defined OK');

  // =========================================================================
  // Task 7: ImportExport
  // =========================================================================
  class ImportExport {
    constructor(groupManager, autoGrouper, storage) {
      this.groupManager = groupManager;
      this.autoGrouper = autoGrouper;
      this.storage = storage;
    }

    /**
     * Export groups and rules to a JSON blob for download.
     */
    exportJSON(username) {
      const data = {
        version: 1,
        exported_at: new Date().toISOString(),
        username: username,
        groups: this.groupManager.exportGroups().groups,
        auto_group_rules: this.autoGrouper.getRules(),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `github-stars-groups-${username}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * Import from a JSON file. Returns parsed and validated data or throws error.
     */
    async importJSON(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            // Basic validation
            if (!data.version || !data.groups) {
              reject(new Error('Invalid import file: missing version or groups'));
              return;
            }
            // Validate group data structure (XSS prevention)
            for (const [id, group] of Object.entries(data.groups)) {
              if (typeof group.name !== 'string' || group.name.length > 100) {
                reject(new Error(`Invalid group name for id: ${id}`));
                return;
              }
              // Sanitize color — only allow #hex format
              if (group.color && !/^#[0-9a-fA-F]{3,8}$/.test(group.color)) {
                group.color = '#58a6ff';
              }
              if (!Array.isArray(group.repos)) {
                reject(new Error(`Invalid repos for group: ${group.name}`));
                return;
              }
              // Validate repo name format (owner/repo)
              group.repos = group.repos.filter(r =>
                typeof r === 'string' && /^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/.test(r)
              );
            }
            resolve(data);
          } catch (err) {
            reject(new Error(`Failed to parse JSON: ${err.message}`));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
  }
console.log('[SGM] Class ImportExport defined OK');

  // =========================================================================
  // Task 8: UIRenderer (CSS + all UI components)
  // =========================================================================

  // --- Inject CSS ---
  const STYLE_ID = 'stars-group-manager-style';
  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      /* Container */
      #sgm-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        max-width: 1280px;
        margin: 0 auto;
        padding: 24px;
      }
      #sgm-container * { box-sizing: border-box; }

      /* Hide original GitHub stars content */
      #user-starred-repos { display: none !important; }
      /* Hide GitHub's native Lists section, Starred topics, and filter bar */
      .js-starred-lists-container,
      .starred-lists,
      [data-testid="starred-lists"],
      .js-starred-topics-container,
      .starred-topics,
      [data-testid="starred-topics"],
      /* Also hide via h2 content pattern — the Lists/Topics sections */
      #user-profile-frame > div:not(#sgm-container) { display: none !important; }

      /* Toolbar */
      .sgm-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .sgm-toolbar h2 {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        flex-shrink: 0;
      }
      .sgm-toolbar .spacer { flex: 1; }
      .sgm-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 5px 12px;
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fgColor-default, #1f2328);
        background: var(--bgColor-default, #ffffff);
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.2s;
      }
      .sgm-btn:hover { background: var(--bgColor-muted, #f6f8fa); }
      .sgm-btn-primary {
        background: var(--color-success-fg, #1a7f37);
        color: #fff;
        border-color: var(--color-success-fg, #1a7f37);
      }
      .sgm-btn-primary:hover { opacity: 0.9; }
      .sgm-btn-danger {
        color: var(--color-danger-fg, #cf222e);
      }
      .sgm-btn-danger:hover {
        background: var(--color-danger-subtle, #ffebe9);
      }

      /* Search & Filter Bar */
      .sgm-filter-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .sgm-search {
        flex: 1;
        min-width: 200px;
        padding: 5px 12px;
        font-size: 14px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        background: var(--bgColor-default, #ffffff);
        color: var(--fgColor-default, #1f2328);
        outline: none;
      }
      .sgm-search:focus {
        border-color: var(--color-accent-fg, #0969da);
        box-shadow: 0 0 0 3px var(--color-accent-subtle, rgba(9,105,218,0.3));
      }
      .sgm-select {
        padding: 5px 12px;
        font-size: 12px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        background: var(--bgColor-default, #ffffff);
        color: var(--fgColor-default, #1f2328);
        cursor: pointer;
      }

      /* Tab Bar */
      .sgm-tabs {
        display: flex;
        align-items: center;
        gap: 0;
        border-bottom: 1px solid var(--borderColor-default, #d0d7de);
        margin-bottom: 16px;
        overflow-x: auto;
        flex-wrap: nowrap;
      }
      .sgm-tab {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 8px 16px;
        font-size: 14px;
        color: var(--fgColor-muted, #656d76);
        border-bottom: 2px solid transparent;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.2s;
        position: relative;
      }
      .sgm-tab:hover { color: var(--fgColor-default, #1f2328); }
      .sgm-tab.active {
        color: var(--fgColor-default, #1f2328);
        font-weight: 600;
        border-bottom-color: var(--color-accent-fg, #0969da);
      }
      .sgm-tab-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 10px;
        background: var(--bgColor-muted, #f6f8fa);
        color: var(--fgColor-muted, #656d76);
      }
      .sgm-tab.active .sgm-tab-count {
        background: var(--color-accent-subtle, #ddf4ff);
        color: var(--color-accent-fg, #0969da);
      }
      .sgm-tab-add {
        padding: 8px 12px;
        color: var(--fgColor-muted, #656d76);
        cursor: pointer;
        font-size: 16px;
      }
      .sgm-tab-add:hover { color: var(--fgColor-default, #1f2328); }

      /* Repo Grid */
      .sgm-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 16px;
      }

      /* Repo Card */
      .sgm-card {
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        padding: 16px;
        background: var(--bgColor-default, #ffffff);
        transition: border-color 0.2s;
        display: flex;
        gap: 12px;
      }
      .sgm-card:hover { border-color: var(--borderColor-muted, #d8dee4); }
      .sgm-card-checkbox {
        flex-shrink: 0;
        margin-top: 2px;
        width: 16px;
        height: 16px;
        cursor: pointer;
      }
      .sgm-card-content { flex: 1; min-width: 0; }
      .sgm-card-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-accent-fg, #0969da);
        text-decoration: none;
        display: block;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sgm-card-name:hover { text-decoration: underline; }
      .sgm-card-desc {
        font-size: 12px;
        color: var(--fgColor-muted, #656d76);
        margin-bottom: 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .sgm-card-meta {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 12px;
        color: var(--fgColor-muted, #656d76);
        flex-wrap: wrap;
      }
      .sgm-card-meta-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .sgm-card-group-tag {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 500;
        border-radius: 12px;
        cursor: pointer;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Batch Action Bar */
      .sgm-batch-bar {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 20px;
        background: var(--bgColor-overlay, #1f2328);
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        font-size: 14px;
        transition: opacity 0.2s, transform 0.2s;
      }
      .sgm-batch-bar.hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        pointer-events: none;
      }
      .sgm-batch-bar .sgm-btn {
        background: var(--bgColor-muted, #30363d);
        color: #fff;
        border-color: var(--borderColor-muted, #484f58);
      }
      .sgm-batch-bar .sgm-btn:hover { background: var(--bgColor-subtle, #484f58); }

      /* Pagination */
      .sgm-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        margin-top: 24px;
      }
      .sgm-page-btn {
        padding: 4px 10px;
        font-size: 12px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 4px;
        cursor: pointer;
        background: var(--bgColor-default, #ffffff);
        color: var(--fgColor-default, #1f2328);
      }
      .sgm-page-btn:hover { background: var(--bgColor-muted, #f6f8fa); }
      .sgm-page-btn.active {
        background: var(--color-accent-fg, #0969da);
        color: #fff;
        border-color: var(--color-accent-fg, #0969da);
      }
      .sgm-page-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* Modal */
      .sgm-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      }
      .sgm-modal {
        background: var(--bgColor-default, #ffffff);
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 12px;
        padding: 24px;
        min-width: 400px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      }
      .sgm-modal h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 16px 0;
      }
      .sgm-modal-input {
        width: 100%;
        padding: 8px 12px;
        font-size: 14px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        margin-bottom: 12px;
        box-sizing: border-box;
      }
      .sgm-modal-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 16px;
      }
      .sgm-modal label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--fgColor-muted, #656d76);
        margin-bottom: 4px;
      }
      .sgm-color-input {
        width: 40px;
        height: 30px;
        padding: 2px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 4px;
        cursor: pointer;
      }

      /* Settings panel */
      .sgm-settings-grid {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 12px;
        align-items: center;
      }
      .sgm-settings-grid label {
        font-size: 13px;
        font-weight: 500;
      }

      /* Toast */
      .sgm-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 16px;
        background: var(--bgColor-overlay, #1f2328);
        color: #fff;
        border-radius: 6px;
        font-size: 13px;
        z-index: 3000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: sgm-toast-in 0.3s ease;
      }
      @keyframes sgm-toast-in {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Loading */
      .sgm-loading {
        text-align: center;
        padding: 40px;
        color: var(--fgColor-muted, #656d76);
        font-size: 14px;
      }
      .sgm-loading-bar {
        width: 200px;
        height: 4px;
        background: var(--bgColor-muted, #f6f8fa);
        border-radius: 2px;
        margin: 12px auto;
        overflow: hidden;
      }
      .sgm-loading-bar-inner {
        height: 100%;
        background: var(--color-accent-fg, #0969da);
        border-radius: 2px;
        transition: width 0.3s;
      }

      /* Empty state */
      .sgm-empty {
        text-align: center;
        padding: 60px 20px;
        color: var(--fgColor-muted, #656d76);
      }

      /* Context menu for tabs */
      .sgm-context-menu {
        position: fixed;
        background: var(--bgColor-default, #ffffff);
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        padding: 4px 0;
        z-index: 3000;
        min-width: 160px;
      }
      .sgm-context-item {
        padding: 6px 16px;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--fgColor-default, #1f2328);
      }
      .sgm-context-item:hover { background: var(--bgColor-muted, #f6f8fa); }
      .sgm-context-item.danger { color: var(--color-danger-fg, #cf222e); }
      .sgm-context-divider {
        height: 1px;
        background: var(--borderColor-default, #d0d7de);
        margin: 4px 0;
      }

      /* Auto-group results */
      .sgm-auto-result {
        margin-bottom: 12px;
        padding: 10px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
      }
      .sgm-auto-result-name {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .sgm-auto-result-repos {
        font-size: 12px;
        color: var(--fgColor-muted, #656d76);
        max-height: 80px;
        overflow-y: auto;
      }
      .sgm-auto-result-check {
        margin-left: 8px;
        cursor: pointer;
      }

      /* Dark mode adjustments */
      @media (prefers-color-scheme: dark) {
        .sgm-tab-count { background: var(--bgColor-muted, #30363d); }
        .sgm-tab.active .sgm-tab-count { background: rgba(9,105,218,0.3); color: var(--color-accent-fg, #58a6ff); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  class UIRenderer {
    constructor() {
      this.container = null;
      this.gridEl = null;
      this.paginationEl = null;
      this.batchBarEl = null;
      this.contextMenuEl = null;
      this._selectedRepos = new Set();
      this._currentPage = 1;
      this._currentPageCount = 1;
      this._callbacks = {};
    }

    on(event, callback) {
      if (!this._callbacks[event]) this._callbacks[event] = [];
      this._callbacks[event].push(callback);
    }

    _emit(event, data) {
      (this._callbacks[event] || []).forEach(cb => cb(data));
    }

    /**
     * Mount the full UI, replacing GitHub's star content area.
     * Inserts SGM container at the position of #user-starred-repos (which is hidden by CSS).
     * Falls back to prepending into .Layout-main or main.
     */
    mount() {
      this.container = document.createElement('div');
      this.container.id = 'sgm-container';

      this.container.innerHTML = `
        <div class="sgm-toolbar">
          <h2>⭐ Stars Group Manager</h2>
          <span class="spacer"></span>
          <button class="sgm-btn" id="sgm-btn-refresh" title="刷新数据">🔄 刷新</button>
          <button class="sgm-btn" id="sgm-btn-auto" title="自动推荐分组">🤖 自动分组</button>
          <button class="sgm-btn" id="sgm-btn-import" title="导入 JSON">📥 导入</button>
          <button class="sgm-btn" id="sgm-btn-export" title="导出 JSON">📤 导出</button>
          <button class="sgm-btn" id="sgm-btn-settings" title="设置">⚙ 设置</button>
        </div>
        <div class="sgm-filter-bar">
          <input type="text" class="sgm-search" id="sgm-search" placeholder="搜索仓库名、描述、标签..." />
          <select class="sgm-select" id="sgm-lang-filter"><option value="">所有语言</option></select>
          <select class="sgm-select" id="sgm-sort-by">
            <option value="updated">最近更新</option>
            <option value="name">名称</option>
            <option value="stars">Stars 数</option>
          </select>
          <select class="sgm-select" id="sgm-sort-order">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </div>
        <div class="sgm-tabs" id="sgm-tabs"></div>
        <div class="sgm-grid" id="sgm-grid"></div>
        <div class="sgm-pagination" id="sgm-pagination"></div>
        <div class="sgm-batch-bar hidden" id="sgm-batch-bar">
          <span id="sgm-batch-count">已选中 0 项</span>
          <button class="sgm-btn" id="sgm-batch-move">移动到分组 ▼</button>
          <button class="sgm-btn" id="sgm-batch-remove">从分组移除</button>
          <button class="sgm-btn" id="sgm-batch-cancel">取消</button>
        </div>
      `;

      // Insert at the correct position — replace the entire original stars content
      const starredEl = document.querySelector('#user-starred-repos');
      const profileFrame = document.querySelector('#user-profile-frame');

      if (profileFrame) {
        // Insert SGM container at the very top of the profile frame,
        // then hide ALL original children (Lists, search bar, starred repos, topics, etc.)
        profileFrame.insertBefore(this.container, profileFrame.firstChild);

        // Hide the sidebar to give more space
        const sidebar = profileFrame.closest('.Layout')?.querySelector('.Layout-sidebar');
        if (sidebar) sidebar.style.display = 'none';

        // Hide all other children in the profile frame (original GitHub content)
        for (const child of profileFrame.children) {
          if (child === this.container) continue;
          child.style.display = 'none';
        }
      } else if (starredEl && starredEl.parentNode) {
        // Fallback: insert before #user-starred-repos and hide siblings
        starredEl.parentNode.insertBefore(this.container, starredEl);

        const sidebar = starredEl.closest('.Layout')?.querySelector('.Layout-sidebar');
        if (sidebar) sidebar.style.display = 'none';

        // Walk up to hide Lists/Topics sections that may be in parent containers
        let container = starredEl.parentNode;
        while (container && container.tagName !== 'MAIN' && container.id !== 'user-profile-frame') {
          for (const child of container.children) {
            if (child === this.container || child.contains(this.container)) continue;
            if (child.contains(starredEl)) continue; // keep starredEl's branch (it's hidden by CSS)
            // Hide sections containing Lists or Starred topics headings
            if (child.querySelector && (
              child.querySelector('h2')?.textContent?.includes('Lists') ||
              child.querySelector('h2')?.textContent?.includes('Starred topics') ||
              child.querySelector('[data-testid="starred-lists"]') ||
              child.querySelector('[data-testid="starred-topics"]')
            )) {
              child.style.display = 'none';
            }
          }
          container = container.parentNode;
        }
      } else {
        // Last resort: prepend into .Layout-main or main
        const mainContent = document.querySelector('.Layout-main') || document.querySelector('main') || document.body;
        mainContent.prepend(this.container);
      }

      this.gridEl = this.container.querySelector('#sgm-grid');
      this.paginationEl = this.container.querySelector('#sgm-pagination');
      this.batchBarEl = this.container.querySelector('#sgm-batch-bar');

      this._bindToolbarEvents();
      this._bindFilterEvents();
      this._bindBatchEvents();
      document.addEventListener('click', () => this._closeContextMenu());
    }

    _bindToolbarEvents() {
      this.container.querySelector('#sgm-btn-refresh').onclick = () => this._emit('refresh');
      this.container.querySelector('#sgm-btn-auto').onclick = () => this._emit('autoGroup');
      this.container.querySelector('#sgm-btn-import').onclick = () => this._emit('import');
      this.container.querySelector('#sgm-btn-export').onclick = () => this._emit('export');
      this.container.querySelector('#sgm-btn-settings').onclick = () => this._emit('openSettings');
    }

    _bindFilterEvents() {
      // Search with 200ms debounce to avoid excessive re-renders
      let searchTimer = null;
      this.container.querySelector('#sgm-search').oninput = (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => this._emit('search', e.target.value), 200);
      };
      this.container.querySelector('#sgm-lang-filter').onchange = (e) => this._emit('filterLang', e.target.value);
      this.container.querySelector('#sgm-sort-by').onchange = (e) => this._emit('sort', { by: e.target.value });
      this.container.querySelector('#sgm-sort-order').onchange = (e) => this._emit('sort', { order: e.target.value });
    }

    _bindBatchEvents() {
      this.container.querySelector('#sgm-batch-move').onclick = () => this._emit('batchMove', [...this._selectedRepos]);
      this.container.querySelector('#sgm-batch-remove').onclick = () => {
        this._emit('batchRemove', [...this._selectedRepos]);
        this._selectedRepos.clear();
        this._updateBatchBar();
        this._renderCards(this._currentRenderData || []);
      };
      this.container.querySelector('#sgm-batch-cancel').onclick = () => {
        this._selectedRepos.clear();
        this._updateBatchBar();
        this._renderCards(this._currentRenderData || []);
      };
    }

    /**
     * Render tab bar.
     * @param {object} groups - { id: { name, color, repos: [] } }
     * @param {number} totalCount - total number of repos
     * @param {number} ungroupedCount - number of ungrouped repos
     * @param {string|null} activeGroupId - currently active tab
     */
    renderTabs(groups, totalCount, ungroupedCount, activeGroupId) {
      const tabsEl = this.container.querySelector('#sgm-tabs');
      let html = '';

      // "All" tab
      html += `<div class="sgm-tab ${activeGroupId === null ? 'active' : ''}" data-group="">
        All <span class="sgm-tab-count">${totalCount}</span>
      </div>`;

      // "Ungrouped" tab
      if (ungroupedCount > 0) {
        html += `<div class="sgm-tab ${activeGroupId === '__none__' ? 'active' : ''}" data-group="__none__">
          未分组 <span class="sgm-tab-count">${ungroupedCount}</span>
        </div>`;
      }

      // Group tabs
      for (const id in groups) {
        const g = groups[id];
        const isActive = activeGroupId === id;
        html += `<div class="sgm-tab ${isActive ? 'active' : ''}" data-group="${id}"
          style="${isActive ? 'border-bottom-color:' + safeColor(g.color) : ''}">
          ${this._escHtml(g.name)} <span class="sgm-tab-count">${g.repos.length}</span>
        </div>`;
      }

      // Add group button
      html += `<div class="sgm-tab-add" id="sgm-tab-add" title="新建分组">+ 新建分组</div>`;

      tabsEl.innerHTML = html;

      // Bind click events
      tabsEl.querySelectorAll('.sgm-tab[data-group]').forEach(tab => {
        tab.onclick = () => {
          const group = tab.dataset.group || null;
          this._emit('tabChange', group === '' ? null : group);
        };
        // Right-click context menu on group tabs (not "All" or "Ungrouped")
        tab.oncontextmenu = (e) => {
          const groupId = tab.dataset.group;
          if (groupId && groupId !== '' && groupId !== '__none__') {
            e.preventDefault();
            this._showContextMenu(e.clientX, e.clientY, groupId);
          }
        };
      });

      tabsEl.querySelector('#sgm-tab-add').onclick = () => this._emit('createGroup');
    }

    /**
     * Render repo cards grid.
     * @param {Array} repos - filtered, sorted repos for current page
     * @param {object} groups - all groups
     * @param {number} page - current page number
     * @param {number} perPage - items per page
     */
    renderGrid(repos, groups, page, perPage) {
      this._currentRenderData = repos;
      this._currentPage = page;
      const totalPages = Math.max(1, Math.ceil(repos.length / perPage));
      this._currentPageCount = totalPages;
      const start = (page - 1) * perPage;
      const pageRepos = repos.slice(start, start + perPage);

      if (pageRepos.length === 0) {
        this.gridEl.innerHTML = '<div class="sgm-empty">没有找到匹配的仓库</div>';
        this.paginationEl.innerHTML = '';
        return;
      }

      let html = '';
      for (const repo of pageRepos) {
        const groupId = this._findGroupForRepo(repo.full_name, groups);
        const group = groupId ? groups[groupId] : null;
        const isSelected = this._selectedRepos.has(repo.full_name);

        html += `<div class="sgm-card">
          <input type="checkbox" class="sgm-card-checkbox"
            ${isSelected ? 'checked' : ''}
            data-repo="${this._escAttr(repo.full_name)}" />
          <div class="sgm-card-content">
            <a class="sgm-card-name" href="${this._escAttr(safeUrl(repo.html_url))}" target="_blank" rel="noopener noreferrer">${this._escHtml(repo.full_name)}</a>
            <div class="sgm-card-desc">${this._escHtml(repo.description)}</div>
            <div class="sgm-card-meta">
              ${repo.language ? `<span class="sgm-card-meta-item">📁 ${this._escHtml(repo.language)}</span>` : ''}
              <span class="sgm-card-meta-item">⭐ ${this._formatNum(repo.stargazers_count)}</span>
              ${group ? `<span class="sgm-card-group-tag" data-repo="${this._escAttr(repo.full_name)}"
                style="background:${safeColor(group.color)}22;color:${safeColor(group.color)};border:1px solid ${safeColor(group.color)}44"
                title="点击修改分组">${this._escHtml(group.name)} ✎</span>` : `<span class="sgm-card-group-tag" data-repo="${this._escAttr(repo.full_name)}"
                style="background:var(--bgColor-muted,#f6f8fa);color:var(--fgColor-muted,#656d76);border:1px solid var(--borderColor-default,#d0d7de)"
                title="点击添加到分组">+ 分组</span>`}
            </div>
          </div>
        </div>`;
      }
      this.gridEl.innerHTML = html;

      // Bind card events
      this.gridEl.querySelectorAll('.sgm-card-checkbox').forEach(cb => {
        cb.onchange = (e) => {
          const repo = e.target.dataset.repo;
          if (e.target.checked) this._selectedRepos.add(repo);
          else this._selectedRepos.delete(repo);
          this._updateBatchBar();
        };
      });
      this.gridEl.querySelectorAll('.sgm-card-group-tag').forEach(tag => {
        tag.onclick = () => this._emit('assignGroup', tag.dataset.repo);
      });

      this._renderPagination(repos.length, perPage, page);
    }

    /**
     * Render pagination.
     */
    _renderPagination(totalItems, perPage, currentPage) {
      const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
      if (totalPages <= 1) {
        this.paginationEl.innerHTML = '';
        return;
      }

      let html = '';
      html += `<button class="sgm-page-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">←</button>`;

      // Show max 7 page buttons
      let startPage = Math.max(1, currentPage - 3);
      let endPage = Math.min(totalPages, startPage + 6);
      if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

      if (startPage > 1) {
        html += `<button class="sgm-page-btn" data-page="1">1</button>`;
        if (startPage > 2) html += `<span style="padding:0 4px;color:var(--fgColor-muted)">...</span>`;
      }
      for (let i = startPage; i <= endPage; i++) {
        html += `<button class="sgm-page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="padding:0 4px;color:var(--fgColor-muted)">...</span>`;
        html += `<button class="sgm-page-btn" data-page="${totalPages}">${totalPages}</button>`;
      }

      html += `<button class="sgm-page-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">→</button>`;

      this.paginationEl.innerHTML = html;
      this.paginationEl.querySelectorAll('.sgm-page-btn').forEach(btn => {
        btn.onclick = () => {
          const page = parseInt(btn.dataset.page);
          if (page >= 1 && page <= totalPages) {
            this._emit('pageChange', page);
          }
        };
      });
    }

    /**
     * Populate language filter dropdown.
     */
    renderLanguageFilter(languages) {
      const select = this.container.querySelector('#sgm-lang-filter');
      let html = '<option value="">所有语言</option>';
      for (const lang of languages) {
        html += `<option value="${this._escAttr(lang)}">${this._escHtml(lang)}</option>`;
      }
      select.innerHTML = html;
    }

    /**
     * Show loading state with progress.
     */
    showLoading(message = '加载中...', progress = 0, total = 0) {
      this.gridEl.innerHTML = `
        <div class="sgm-loading">
          <div>${this._escHtml(message)}</div>
          ${total > 0 ? `<div>(${progress} / ${total})</div>` : ''}
          <div class="sgm-loading-bar"><div class="sgm-loading-bar-inner" style="width:${total > 0 ? (progress / total * 100) : 0}%"></div></div>
        </div>`;
      this.paginationEl.innerHTML = '';
    }

    /**
     * Show error state.
     */
    showError(message, retryCallback) {
      this.gridEl.innerHTML = `
        <div class="sgm-empty">
          <div>❌ ${this._escHtml(message)}</div>
          ${retryCallback ? '<button class="sgm-btn sgm-btn-primary" id="sgm-retry">重试</button>' : ''}
        </div>`;
      if (retryCallback) {
        this.gridEl.querySelector('#sgm-retry').onclick = retryCallback;
      }
    }

    /**
     * Show a toast notification.
     */
    showToast(message, duration = 3000) {
      const toast = document.createElement('div');
      toast.className = 'sgm-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    /**
     * Show create/edit group modal.
     * @param {object} opts - { name, color, groupId }
     * @returns {Promise} resolved with { name, color } or rejected
     */
    showGroupModal(opts = {}) {
      return new Promise((resolve, reject) => {
        const isEdit = !!opts.groupId;
        const overlay = document.createElement('div');
        overlay.className = 'sgm-modal-overlay';
        overlay.innerHTML = `
          <div class="sgm-modal">
            <h3>${isEdit ? '编辑分组' : '新建分组'}</h3>
            <label>分组名称</label>
            <input type="text" class="sgm-modal-input" id="sgm-modal-name"
              value="${this._escAttr(opts.name || '')}" placeholder="例如: AI / LLM" />
            <label>颜色</label>
            <input type="color" class="sgm-color-input" id="sgm-modal-color"
              value="${opts.color || '#58a6ff'}" />
            <div class="sgm-modal-actions">
              <button class="sgm-btn" id="sgm-modal-cancel">取消</button>
              <button class="sgm-btn sgm-btn-primary" id="sgm-modal-save">${isEdit ? '保存' : '创建'}</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);
        const nameInput = overlay.querySelector('#sgm-modal-name');
        const colorInput = overlay.querySelector('#sgm-modal-color');

        overlay.querySelector('#sgm-modal-cancel').onclick = () => {
          overlay.remove();
          reject();
        };
        overlay.onclick = (e) => {
          if (e.target === overlay) { overlay.remove(); reject(); }
        };
        overlay.querySelector('#sgm-modal-save').onclick = () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.focus(); return; }
          overlay.remove();
          resolve({ name, color: colorInput.value });
        };
        nameInput.focus();
        nameInput.onkeydown = (e) => {
          if (e.key === 'Enter') overlay.querySelector('#sgm-modal-save').click();
          if (e.key === 'Escape') overlay.querySelector('#sgm-modal-cancel').click();
        };
      });
    }

    /**
     * Show assign-to-group modal for a single repo.
     * @param {string} full_name
     * @param {object} groups
     * @param {string|null} currentGroupId
     * @returns {Promise} resolved with { action: 'add'|'move'|'remove', groupId }
     */
    showAssignModal(full_name, groups, currentGroupId) {
      return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        overlay.className = 'sgm-modal-overlay';

        let groupOptions = `<option value="__none__">-- 未分组 --</option>`;
        for (const id in groups) {
          const g = groups[id];
          groupOptions += `<option value="${id}" ${currentGroupId === id ? 'selected' : ''}>${this._escHtml(g.name)}</option>`;
        }

        overlay.innerHTML = `
          <div class="sgm-modal">
            <h3>分配分组</h3>
            <div style="font-size:13px;color:var(--fgColor-muted);margin-bottom:12px">${this._escHtml(full_name)}</div>
            <label>选择分组</label>
            <select class="sgm-modal-input" id="sgm-assign-select">${groupOptions}</select>
            <div class="sgm-modal-actions">
              <button class="sgm-btn" id="sgm-modal-cancel">取消</button>
              <button class="sgm-btn sgm-btn-primary" id="sgm-modal-save">确定</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);
        const select = overlay.querySelector('#sgm-assign-select');

        overlay.querySelector('#sgm-modal-cancel').onclick = () => { overlay.remove(); reject(); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); reject(); } };
        overlay.querySelector('#sgm-modal-save').onclick = () => {
          const selectedId = select.value;
          overlay.remove();
          if (selectedId === '__none__') {
            resolve({ action: 'remove', groupId: currentGroupId });
          } else if (currentGroupId && currentGroupId !== selectedId) {
            resolve({ action: 'move', groupId: selectedId, fromGroupId: currentGroupId });
          } else if (!currentGroupId) {
            resolve({ action: 'add', groupId: selectedId });
          } else {
            reject(); // no change
          }
        };
      });
    }

    /**
     * Show batch move to group dropdown (as modal since we can't use native dropdown).
     */
    showBatchMoveModal(groups) {
      return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        overlay.className = 'sgm-modal-overlay';

        let groupOptions = '';
        for (const id in groups) {
          const g = groups[id];
          groupOptions += `<option value="${id}">${this._escHtml(g.name)}</option>`;
        }

        overlay.innerHTML = `
          <div class="sgm-modal">
            <h3>批量移动到分组</h3>
            <select class="sgm-modal-input" id="sgm-batch-select">${groupOptions || '<option value="">无分组</option>'}</select>
            <div class="sgm-modal-actions">
              <button class="sgm-btn" id="sgm-modal-cancel">取消</button>
              <button class="sgm-btn sgm-btn-primary" id="sgm-modal-save">移动</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);
        overlay.querySelector('#sgm-modal-cancel').onclick = () => { overlay.remove(); reject(); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); reject(); } };
        overlay.querySelector('#sgm-modal-save').onclick = () => {
          overlay.remove();
          resolve(overlay.querySelector('#sgm-batch-select')?.value || '');
        };
      });
    }

    /**
     * Show auto-group results modal.
     * @param {object} suggestions - { groupName: [full_name, ...] }
     * @param {string[]} ungrouped
     * @returns {Promise} resolved with { confirmed: boolean, suggestions, clearExisting }
     */
    showAutoGroupModal(suggestions, ungrouped) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'sgm-modal-overlay';

        let resultsHtml = '';
        for (const name of Object.keys(suggestions)) {
          const repos = suggestions[name];
          resultsHtml += `
            <div class="sgm-auto-result">
              <span class="sgm-auto-result-name">
                <input type="checkbox" class="sgm-auto-result-check" data-group="${this._escAttr(name)}" checked />
                ${this._escHtml(name)} (${repos.length})
              </span>
              <div class="sgm-auto-result-repos">${repos.map(r => this._escHtml(r)).join(', ')}</div>
            </div>`;
        }

        overlay.innerHTML = `
          <div class="sgm-modal">
            <h3>🤖 自动分组推荐结果</h3>
            <div style="font-size:12px;color:var(--fgColor-muted);margin-bottom:12px">
              未分组: ${ungrouped.length} 个仓库
            </div>
            <div id="sgm-auto-results" style="max-height:300px;overflow-y:auto;margin-bottom:12px">
              ${resultsHtml}
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:12px;cursor:pointer">
              <input type="checkbox" id="sgm-auto-clear" />
              应用前清除现有分组（覆盖模式）
            </label>
            <div class="sgm-modal-actions">
              <button class="sgm-btn" id="sgm-modal-cancel">取消</button>
              <button class="sgm-btn sgm-btn-primary" id="sgm-modal-save">应用选中的分组</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector('#sgm-modal-cancel').onclick = () => { overlay.remove(); resolve({ confirmed: false }); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve({ confirmed: false }); } };
        overlay.querySelector('#sgm-modal-save').onclick = () => {
          // Get checked groups
          const checked = new Set();
          overlay.querySelectorAll('.sgm-auto-result-check:checked').forEach(cb => {
            checked.add(cb.dataset.group);
          });
          const filteredSuggestions = {};
          for (const name of checked) {
            if (suggestions[name]) filteredSuggestions[name] = suggestions[name];
          }
          const clearExisting = overlay.querySelector('#sgm-auto-clear').checked;
          overlay.remove();
          resolve({ confirmed: true, suggestions: filteredSuggestions, clearExisting });
        };
      });
    }

    /**
     * Show settings modal.
     */
    showSettingsModal(settings) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'sgm-modal-overlay';
        overlay.innerHTML = `
          <div class="sgm-modal">
            <h3>⚙ 设置</h3>
            <div class="sgm-settings-grid">
              <label>GitHub Token</label>
              <input type="password" class="sgm-modal-input" id="sgm-set-token"
                value="${this._escAttr(settings.github_token || '')}"
                placeholder="ghp_xxxx（可选，提高 API 速率限制）" />
              <label>每页数量</label>
              <select class="sgm-modal-input" id="sgm-set-perpage">
                <option value="15" ${settings.items_per_page === 15 ? 'selected' : ''}>15</option>
                <option value="30" ${settings.items_per_page === 30 ? 'selected' : ''}>30</option>
                <option value="60" ${settings.items_per_page === 60 ? 'selected' : ''}>60</option>
                <option value="100" ${settings.items_per_page === 100 ? 'selected' : ''}>100</option>
              </select>
              <label>默认排序</label>
              <select class="sgm-modal-input" id="sgm-set-sort">
                <option value="updated" ${settings.sort_by === 'updated' ? 'selected' : ''}>最近更新</option>
                <option value="name" ${settings.sort_by === 'name' ? 'selected' : ''}>名称</option>
                <option value="stars" ${settings.sort_by === 'stars' ? 'selected' : ''}>Stars 数</option>
              </select>
            </div>
            <div style="margin-top:16px;font-size:12px;color:var(--fgColor-muted)">
              缓存时间: ${settings._cacheTime ? new Date(settings._cacheTime).toLocaleString() : '无缓存'}
            </div>
            <div class="sgm-modal-actions">
              <button class="sgm-btn" id="sgm-modal-cancel">取消</button>
              <button class="sgm-btn sgm-btn-primary" id="sgm-modal-save">保存</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);
        overlay.querySelector('#sgm-modal-cancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };
        overlay.querySelector('#sgm-modal-save').onclick = () => {
          overlay.remove();
          resolve({
            github_token: overlay.querySelector('#sgm-set-token').value.trim(),
            items_per_page: parseInt(overlay.querySelector('#sgm-set-perpage').value),
            sort_by: overlay.querySelector('#sgm-set-sort').value,
          });
        };
      });
    }

    /**
     * Show import mode choice (overwrite vs merge).
     */
    showImportChoiceModal() {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'sgm-modal-overlay';
        overlay.innerHTML = `
          <div class="sgm-modal">
            <h3>📥 导入分组</h3>
            <p style="font-size:13px;color:var(--fgColor-muted);margin-bottom:16px">选择导入模式：</p>
            <button class="sgm-btn" style="width:100%;margin-bottom:8px;justify-content:center" id="sgm-import-overwrite">
              覆盖 — 完全替换当前分组
            </button>
            <button class="sgm-btn" style="width:100%;margin-bottom:16px;justify-content:center" id="sgm-import-merge">
              合并 — 与现有分组合并（repos 取并集）
            </button>
            <div class="sgm-modal-actions">
              <button class="sgm-btn" id="sgm-modal-cancel">取消</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);
        overlay.querySelector('#sgm-modal-cancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };
        overlay.querySelector('#sgm-import-overwrite').onclick = () => { overlay.remove(); resolve('overwrite'); };
        overlay.querySelector('#sgm-import-merge').onclick = () => { overlay.remove(); resolve('merge'); };
      });
    }

    /**
     * Show context menu for group tab actions.
     */
    _showContextMenu(x, y, groupId) {
      this._closeContextMenu();
      const menu = document.createElement('div');
      menu.className = 'sgm-context-menu';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.innerHTML = `
        <div class="sgm-context-item" data-action="rename">✏️ 重命名</div>
        <div class="sgm-context-item" data-action="color">🎨 修改颜色</div>
        <div class="sgm-context-divider"></div>
        <div class="sgm-context-item danger" data-action="delete">🗑️ 删除分组</div>
      `;

      menu.querySelector('[data-action="rename"]').onclick = () => {
        this._closeContextMenu();
        this._emit('renameGroup', groupId);
      };
      menu.querySelector('[data-action="color"]').onclick = () => {
        this._closeContextMenu();
        this._emit('recolorGroup', groupId);
      };
      menu.querySelector('[data-action="delete"]').onclick = () => {
        this._closeContextMenu();
        this._emit('deleteGroup', groupId);
      };

      document.body.appendChild(menu);
      this.contextMenuEl = menu;
    }

    _closeContextMenu() {
      if (this.contextMenuEl) {
        this.contextMenuEl.remove();
        this.contextMenuEl = null;
      }
    }

    _updateBatchBar() {
      const count = this._selectedRepos.size;
      this.batchBarEl.querySelector('#sgm-batch-count').textContent = `已选中 ${count} 项`;
      if (count > 0) {
        this.batchBarEl.classList.remove('hidden');
      } else {
        this.batchBarEl.classList.add('hidden');
      }
    }

    _findGroupForRepo(full_name, groups) {
      for (const id in groups) {
        if (groups[id].repos.includes(full_name)) return id;
      }
      return null;
    }

    _renderCards(repos) {
      // Re-render with current data — use the last renderGrid call's info
      // This is called after selection changes to update checkbox states
      this.gridEl.querySelectorAll('.sgm-card-checkbox').forEach(cb => {
        cb.checked = this._selectedRepos.has(cb.dataset.repo);
      });
    }

    _escHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _escAttr(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _formatNum(n) {
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return n.toString();
    }

    /**
     * Trigger file input for import.
     */
    triggerFileInput() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => resolve(e.target.files[0] || null);
        input.click();
      });
    }

    /**
     * Reset page to 1.
     */
    resetPage() {
      this._currentPage = 1;
    }
  }
console.log('[SGM] Class UIRenderer defined OK');

  // =========================================================================
  // Task 9: App main entry
  // =========================================================================
  class App {
    constructor() {
      this.storage = new StorageManager();
      this.api = new APIFetcher(this.storage);
      this.groups = new GroupManager(this.storage);
      this.autoGrouper = new AutoGrouper(this.storage);
      this.searchFilter = new SearchFilter();
      this.importExport = new ImportExport(this.groups, this.autoGrouper, this.storage);
      this.ui = new UIRenderer();

      this._repos = [];        // All repos from cache/API
      this._settings = {};
      this._username = '';
      this._activeGroupId = null; // null = "All"
      this._initialized = false;
    }

    async init() {
      // Only run on own Stars page — check logged-in user matches URL user
      const urlMatch = window.location.pathname.match(/^\/([^/]+)/);
      const urlUsername = urlMatch ? urlMatch[1] : '';
      const loggedInUser = this._getLoggedInUser();

      console.log('[SGM] init() called — urlUser:', urlUsername, 'loggedInUser:', loggedInUser);

      // Skip only if logged in AND viewing someone else's stars
      if (loggedInUser && urlUsername.toLowerCase() !== loggedInUser.toLowerCase()) {
        console.log('[SGM] Skipping — viewing someone else\'s stars');
        return;
      }

      this._username = urlUsername;
      this._settings = this.storage.getSettings();

      // Mount UI at the correct position
      this.ui.mount();
      console.log('[SGM] UI mounted');

      // Load cached repos first, then optionally refresh from API
      this._loadCachedData();
      console.log('[SGM] Cached repos loaded:', this._repos.length);

      if (this._repos.length === 0) {
        // No cache: try DOM parsing first for instant display, then API for full data
        this._loadFromDOM();
        console.log('[SGM] DOM fallback repos:', this._repos.length);
      }

      try {
        await this._loadFromAPI();
      } catch (err) {
        console.error('[SGM] _loadFromAPI threw:', err);
      }
      console.log('[SGM] After API load, total repos:', this._repos.length);
      this._bindUIEvents();
      this._render();
      this._initialized = true;
      console.log('[SGM] Initialization complete, rendering', this._repos.length, 'repos');
    }

    /**
     * Get the currently logged-in GitHub username from page meta.
     */
    _getLoggedInUser() {
      const meta = document.querySelector('meta[name="user-login"]');
      return meta ? meta.content : '';
    }

    /**
     * Parse repos from the current page DOM as a quick fallback.
     * This gives instant results before the API call completes.
     */
    _loadFromDOM() {
      // GitHub uses both .col-12.d-flex and .col-12.d-block for repo cards
      const repoEls = document.querySelectorAll('#user-starred-repos .col-12.d-block, #user-starred-repos .col-12.d-flex');
      if (repoEls.length === 0) return;

      const repos = [];
      for (const el of repoEls) {
        try {
          const nameEl = el.querySelector('h3 a');
          const descEl = el.querySelector('p');
          const langEl = el.querySelector('[itemprop="programmingLanguage"]');
          const starsEl = el.querySelector('.stargazers');
          const link = nameEl?.getAttribute('href') || '';

          if (!link) continue;

          repos.push(normalizeRepo({
            full_name: link.replace(/^\//, ''),
            description: descEl?.textContent?.trim() || '',
            language: langEl?.textContent?.trim() || '',
            topics: [],
            stargazers_count: parseInt(starsEl?.textContent?.replace(/,/g, '') || '0'),
            html_url: 'https://github.com' + link,
            updated_at: '',
          }));
        } catch (e) {
          // Skip malformed entries
        }
      }

      if (repos.length > 0) {
        this._repos = repos;
        this.ui.showToast(`已从页面解析 ${repos.length} 个仓库（API 加载中...）`);
      }
    }

    _loadCachedData() {
      const cache = this.storage.getCache();
      if (cache.repos && cache.repos.length > 0) {
        this._repos = cache.repos.map(normalizeRepo);
      }
    }

    async _loadFromAPI(forceRefresh = false) {
      const cache = this.storage.getCache();

      // Use cache if valid and not forced refresh
      if (!forceRefresh && cache.repos && cache.repos.length > 0 && !this.storage.isCacheExpired()) {
        this._repos = cache.repos.map(normalizeRepo);
        if (this._repos.length > 0) {
          this.ui.showToast(`已加载 ${this._repos.length} 个缓存仓库`);
          return;
        }
      }

      // Rate limit check (if we have info from previous requests)
      if (this.api._lastRateLimit && this.api._lastRateLimit.remaining < 10 && !this._settings.github_token) {
        const resetTime = new Date(this.api._lastRateLimit.reset * 1000);
        this.ui.showToast(`API 速率限制即将耗尽（剩余 ${this.api._lastRateLimit.remaining} 次），请等待至 ${resetTime.toLocaleTimeString()}`);
        if (this._repos.length > 0) {
          this._render();
          return; // Use cache instead
        }
      }

      // Check for token
      const token = this._settings.github_token || '';

      if (this._repos.length > 0) {
        this.ui.showToast('正在刷新数据...');
      } else {
        this.ui.showLoading('正在获取 Stars 数据...');
      }

      try {
        const repos = await this.api.fetchAllStars(
          this._username,
          token,
          (progress) => {
            if (this._repos.length === 0) {
              this.ui.showLoading('正在获取 Stars 数据...', progress, null);
            }
          }
        );

        this._repos = repos.map(normalizeRepo);
        this.storage.saveCache({
          repos: repos,
          fetched_at: Date.now(),
          total_count: repos.length,
        });

        this.ui.showToast(`成功加载 ${repos.length} 个仓库`);
        this._render();
      } catch (err) {
        console.error('[Stars Group Manager] API fetch failed:', err);
        if (this._repos.length > 0) {
          this.ui.showToast(`API 获取失败 (${err.message})，使用${this._repos.length < 50 ? '页面解析' : '缓存'}数据`);
          this._render();
        } else {
          // Try DOM fallback one more time
          this._loadFromDOM();
          if (this._repos.length > 0) {
            this.ui.showToast(`API 获取失败，已从页面解析 ${this._repos.length} 个仓库。建议在设置中配置 GitHub Token 以获取全量数据。`);
            this._render();
          } else {
            this.ui.showError(
              `加载失败: ${err.message}。请在设置中配置 GitHub Personal Access Token 以提高 API 限额。`,
              () => this._loadFromAPI(true)
            );
          }
        }
      }
    }

    _bindUIEvents() {
      // Refresh
      this.ui.on('refresh', () => this._loadFromAPI(true).then(() => this._render()));

      // Tab change
      this.ui.on('tabChange', (groupId) => {
        this._activeGroupId = groupId === '' ? null : groupId;
        this.searchFilter.groupFilter = this._activeGroupId;
        this.ui.resetPage();
        this._render();
      });

      // Search (debounced in UIRenderer._bindFilterEvents at 200ms)
      this.ui.on('search', (query) => {
        this.searchFilter.query = query;
        this.ui.resetPage();
        this._render();
      });

      // Language filter
      this.ui.on('filterLang', (lang) => {
        this.searchFilter.language = lang;
        this.ui.resetPage();
        this._render();
      });

      // Sort
      this.ui.on('sort', (config) => {
        if (config.by) this._settings.sort_by = config.by;
        if (config.order) this._settings.sort_order = config.order;
        this.ui.resetPage();
        this._render();
      });

      // Page change
      this.ui.on('pageChange', (page) => {
        this.ui._currentPage = page;
        this._renderGrid();
      });

      // Create group
      this.ui.on('createGroup', async () => {
        try {
          const { name, color } = await this.ui.showGroupModal();
          this.groups.createGroup(name, color);
          this.groups.flush();
          this._render();
          this.ui.showToast(`已创建分组 "${name}"`);
        } catch (e) { /* cancelled */ }
      });

      // Rename group
      this.ui.on('renameGroup', async (groupId) => {
        const group = this.groups.getAll()[groupId];
        if (!group) return;
        try {
          const { name, color } = await this.ui.showGroupModal({ name: group.name, color: group.color, groupId });
          this.groups.renameGroup(groupId, name);
          if (color !== group.color) this.groups.setGroupColor(groupId, color);
          this.groups.flush();
          this._render();
          this.ui.showToast(`分组已重命名为 "${name}"`);
        } catch (e) { /* cancelled */ }
      });

      // Recolor group
      this.ui.on('recolorGroup', async (groupId) => {
        const group = this.groups.getAll()[groupId];
        if (!group) return;
        try {
          const { name, color } = await this.ui.showGroupModal({ name: group.name, color: group.color, groupId });
          this.groups.setGroupColor(groupId, color);
          this.groups.flush();
          this._render();
        } catch (e) { /* cancelled */ }
      });

      // Delete group
      this.ui.on('deleteGroup', async (groupId) => {
        const group = this.groups.getAll()[groupId];
        if (!group) return;
        if (!confirm(`确定要删除分组 "${group.name}" 吗？（仓库不会被删除，只会变为未分组）`)) return;
        this.groups.deleteGroup(groupId);
        this.groups.flush();
        if (this._activeGroupId === groupId) {
          this._activeGroupId = null;
          this.searchFilter.groupFilter = null;
        }
        this._render();
        this.ui.showToast(`已删除分组 "${group.name}"`);
      });

      // Assign single repo to group
      this.ui.on('assignGroup', async (full_name) => {
        const currentGroupId = this.groups.getRepoGroup(full_name);
        try {
          const result = await this.ui.showAssignModal(full_name, this.groups.getAll(), currentGroupId);
          if (result.action === 'add') {
            this.groups.addRepoToGroup(result.groupId, full_name);
          } else if (result.action === 'move') {
            this.groups.moveRepo(full_name, result.fromGroupId, result.groupId);
          } else if (result.action === 'remove') {
            this.groups.removeRepoFromGroup(result.groupId, full_name);
          }
          this.groups.flush();
          this._render();
        } catch (e) { /* cancelled */ }
      });

      // Batch move
      this.ui.on('batchMove', async (repos) => {
        try {
          const groupId = await this.ui.showBatchMoveModal(this.groups.getAll());
          if (!groupId) return;
          // Remove from all groups first, then add to target group
          for (const repo of repos) this.groups.removeRepoFromAll(repo);
          this.groups.batchAddToGroup(groupId, repos);
          this.groups.flush();
          this.ui._selectedRepos.clear();
          this.ui._updateBatchBar();
          this._render();
          this.ui.showToast(`已移动 ${repos.length} 个仓库`);
        } catch (e) { /* cancelled */ }
      });

      // Batch remove
      this.ui.on('batchRemove', (repos) => {
        for (const repo of repos) this.groups.removeRepoFromAll(repo);
        this.groups.flush();
        this._render();
        this.ui.showToast(`已从分组中移除 ${repos.length} 个仓库`);
      });

      // Auto group
      this.ui.on('autoGroup', async () => {
        if (this._repos.length === 0) {
          this.ui.showToast('没有仓库数据，请先刷新');
          return;
        }
        const { suggestions, ungrouped } = this.autoGrouper.suggestGroups(this._repos);
        try {
          const result = await this.ui.showAutoGroupModal(suggestions, ungrouped);
          if (result.confirmed && Object.keys(result.suggestions).length > 0) {
            this.autoGrouper.applySuggestions(result.suggestions, this.groups, result.clearExisting);
            this.groups.flush();
            this._render();
            let totalApplied = Object.values(result.suggestions).flat().length;
            this.ui.showToast(`已应用自动分组（${totalApplied} 个仓库）`);
          }
        } catch (e) { /* cancelled */ }
      });

      // Export
      this.ui.on('export', () => {
        this.importExport.exportJSON(this._username);
        this.ui.showToast('分组数据已导出');
      });

      // Import
      this.ui.on('import', async () => {
        try {
          const mode = await this.ui.showImportChoiceModal();
          if (!mode) return;

          const file = await this.ui.triggerFileInput();
          if (!file) return;

          const data = await this.importExport.importJSON(file);
          this.groups.importGroups(data, mode);

          // Import custom rules if present
          if (data.auto_group_rules) {
            this.autoGrouper.saveRules(data.auto_group_rules);
          }

          // Note: importGroups already calls save() internally with flush semantics
          // since it calls this.save() which now only marks dirty; flush here for safety
          this.groups.flush();
          this._render();
          this.ui.showToast(`分组数据已${mode === 'overwrite' ? '覆盖' : '合并'}导入`);
        } catch (err) {
          this.ui.showToast(`导入失败: ${err.message}`);
        }
      });

      // Settings
      this.ui.on('openSettings', async () => {
        const cache = this.storage.getCache();
        const currentSettings = {
          ...this._settings,
          _cacheTime: cache.fetched_at || 0,
        };
        const result = await this.ui.showSettingsModal(currentSettings);
        if (result) {
          this._settings = { ...this._settings, ...result };
          this.storage.saveSettings(this._settings);
          this._render();
          this.ui.showToast('设置已保存');
        }
      });
    }

    _render() {
      const groupData = this.groups.getAll();
      const totalCount = this._repos.length;
      const groupedCount = new Set(Object.values(groupData).flatMap(g => g.repos)).size;
      const ungroupedCount = Math.max(0, totalCount - groupedCount);

      this.ui.renderLanguageFilter(SearchFilter.getUniqueLanguages(this._repos));
      this.ui.renderTabs(groupData, totalCount, ungroupedCount, this._activeGroupId);
      this._renderGrid();
    }

    _renderGrid() {
      const filtered = this.searchFilter.apply(this._repos, this.groups, {
        by: this._settings.sort_by,
        order: this._settings.sort_order,
      });
      this.ui.renderGrid(
        filtered,
        this.groups.getAll(),
        this.ui._currentPage,
        this._settings.items_per_page
      );
    }
  }
console.log('[SGM] Class App defined OK');

  // --- Register Tampermonkey menu commands ---
  GM_registerMenuCommand('🔄 刷新 Stars 数据', () => {
    if (app && app._initialized) app._loadFromAPI(true).then(() => app._render());
  });
  GM_registerMenuCommand('🤖 自动分组', () => {
    if (app && app._initialized) app.ui._emit('autoGroup');
  });
  GM_registerMenuCommand('📤 导出分组', () => {
    if (app && app._initialized) app.importExport.exportJSON(app._username);
  });

  // --- Initialize with Turbo/pjax compatibility ---
  let app = null;

  function initApp() {
    console.log('[SGM] initApp called, URL=' + location.href);
    // Only run on Stars tab
    if (!location.search.includes('tab=stars')) {
      console.log('[SGM] Not stars tab, skipping');
      return;
    }

    // Prevent duplicate initialization
    const existing = document.getElementById('sgm-container');
    if (existing) existing.remove();

    console.log('[SGM] Creating App instance...');
    try {
      app = new App();
      console.log('[SGM] App created, calling init()...');
      app.init();
      console.log('[SGM] app.init() returned (async, may still be running)');
    } catch (err) {
      console.error('[SGM] Error during init:', err);
    }
  }

  // Initial run
  console.log('[SGM] About to call initApp()');
  initApp();

  // Turbo navigation (GitHub's SPA framework)
  document.addEventListener('turbo:load', initApp);
  document.addEventListener('turbo:render', initApp);

  // pjax fallback (some GitHub pages still use pjax)
  document.addEventListener('pjax:end', initApp);

  // URL change fallback (catches all navigation methods)
  let _lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      initApp();
    }
  }).observe(document, { subtree: true, childList: true });
})();
