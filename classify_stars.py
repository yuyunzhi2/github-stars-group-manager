import json
from datetime import datetime, timezone

with open(r"D:\git\github-stars-group-manager\stars_raw.json", "r", encoding="utf-8") as f:
    repos = json.load(f)

# Helper: check if any keyword appears as a whole word or known phrase in text
def has_kw(text, keywords):
    """Check if any keyword appears in text. Keywords can be multi-word phrases."""
    for kw in keywords:
        if kw in text:
            return True
    return False

def classify_repo(r):
    name = r["full_name"].lower()
    desc = (r.get("description") or "").lower()
    topics = " ".join(t.lower() for t in (r.get("topics") or []))
    all_text = name + " " + desc + " " + topics
    matched = []

    # ==========================================
    # Priority 1: CC工具 (Claude Code ecosystem)
    # These are very specific, match first
    # ==========================================
    cc_exact = [
        # claude code core
        "anthropics/claude-code", "anthropics/skills", "anthropics/claude-cookbooks",
        "anthropics/financial-services",
        # claude code tools & plugins
        "claude-code", "claude code", "claude_code",
        "claude-hud", "claude-mem", "claude-obsidian", "claude-skills",
        "claude-howto", "claude-agents", "claude-peers",
        "cc-statusline", "cc-wf-studio",
        # openclaw ecosystem
        "openclaw", "opencode", "claw-code", "weclaw", "fastclaw", "picoclaw",
        "clawrecipes", "clawshop", "clawfeed", "superclaw",
        "supermemoryai/openclaw", "openclaw/openclaw",
        # antigravity / superpowers
        "antigravity", "superpowers", "superclaude",
        # codex++
        "codex-plusplus", "codexplusplus",
        # codebuff
        "codebuffai/codebuff",
        # harness
        "harnesscode", "harness-engineering",
        # specific CC tools
        "last30days-skill", "alwaysontop",
        "oh-my-claudecode", "oh-my-opencode",
        "thinking-claude", "buildwithclaude", "learn-claude-code",
        # awesome lists for CC
        "awesome-claude-code", "awesome-claude-skills", "awesome-codex-skills",
        "awesome-claude-code-subagents",
        "openclaw-china", "openclaw-cn", "openclaw-paradigm",
        "awesome-openclaw", "openclaw-mission", "openclaw-supermemory",
        "openclaw-ai-ecommerce", "xianyu-openclaw",
        "authorclaw", "opencow", "ultraworkers/claw-code",
        "getclawe/clawe", "garrytan/gstack", "garrytan/gbrain",
        # additional CC-related
        "qiaomu-goal-meta-skill", "goal-writer", "serenity-skill",
        "cl4r1t4s", "system prompts", "skill-prompt-generator",
        "codex learning", "codex task",
        "design.md", "tw93/waza",
        "mattpocock/skills", "pandazki/pneuma-skills",
        "agent-skills", "my-skills",
    ]
    if has_kw(name, cc_exact) or has_kw(desc, cc_exact):
        matched.append("CC工具")

    # ==========================================
    # Priority 2: MCP工具
    # ==========================================
    mcp_kw = [
        "mcp-server", "mcp_server", "model-context-protocol",
        "modelcontextprotocol", "/mcp", "-mcp", "_mcp",
        "awesome-mcp",
    ]
    if has_kw(name, mcp_kw) or has_kw(topics, ["mcp"]):
        matched.append("MCP工具")

    # ==========================================
    # Priority 3: 语音与音乐
    # ==========================================
    voice_kw = [
        "tts", "text-to-speech", "voice-cloning", "voice-pro",
        "fish-speech", "spark-tts", "gpt-sovits", "sovits",
        "voxcpm", "chattts", "speech-synthesis",
        "supertonic", "omnivoice", "voice-studio",
        "neuphonic/neutts", "index-tts", "higgs-audio",
        "moyin-creator", "music-genre-finder",
        "vibefoicefusion", "abus-aikorea/voice-pro",
        "ace-step", "voice ai", "voice generation",
        "ten-framework",
    ]
    if has_kw(name, voice_kw) or has_kw(desc, voice_kw):
        matched.append("语音与音乐")

    # ==========================================
    # Priority 4: 图像视频
    # ==========================================
    img_vid_kw = [
        # Video production
        "video-production", "video-editing", "video-subtitle", "video-generator",
        "video2x", "videocut", "videolingo", "funclip",
        "auto-editor", "shotboard", "movie-storyboard", "storyboard",
        "fastmovieai", "ai-movie-studio", "huobao-drama", "short-drama",
        "bigbanana-ai-director", "skyreels", "moneyprinterturbo",
        "ltx-video", "remotion", "digitalhuman",
        "wan2gp", "framepack", "kolors", "kling",
        "seedance", "veo-3", "voe-3-prompting",
        # Image generation
        "comfyui", "stable-diffusion", "image-generation", "text-to-image",
        "text2img", "image-generator", "midjourney", "dall-e", "dalle",
        "upscayl", "supersplat", "pollinations", "tripo",
        "promptfill", "gpt4o-images", "designedit",
        "dreamomni", "hunyuanworld",
        # PPT/Slides (visual output)
        "aippt", "ppt-master", "ppt-skills", "pptagent", "multiagentppt",
        "nanobanana-ppt", "banana-slides", "slidev", "revealjs",
        "slideshow", "nanobanana", "nano-banana",
        # Visual tools
        "infographic", "pixelle-video", "html-video", "waytovideo",
        "cinematic-prompts", "toonflow", "directorsconsole",
        "blender-mcp", "unreal-engine-mcp",
        "ytdownloader", "yt-dlp", "bilibilidown", "res-downloader",
        "wx_channels_download", "x-video-downloader",
        "aimedia", "vidbee", "drawnix",
        "video-wrapper", "video-materials", "frames-to-video",
        "ai-ppt", "seedance2", "ralph-desktop",
        "guizang-s-prompt", "visualstory",
        "awesome-gpt4o-images", "text2img-cloudflare",
        "awesome-video-production", "maptoposter",
        "cloud-document-converter",
        "huanshere/videolingo",
        # additional
        "map3d", "3d map", "ai-moive", "ai-video",
        "nano-image-generator", "makepad-skills",
        "banana-prompt-quicker", "banana-prompt",
        "kongzhecn/omg", "omg:", "occlusion-friendly",
        "qwenmultiangle", "ai-product-page-generator",
        "iptv", "iptv-api", "live tv",
        "liying", "photo processing",
        "onlook-dev/onlook", "ai-first design",
        "webgal", "galgame",
    ]
    if has_kw(name, img_vid_kw) or has_kw(desc, img_vid_kw):
        matched.append("图像视频")

    # ==========================================
    # Priority 5: 写作
    # ==========================================
    writing_kw = [
        "writing-agent", "writing-helper", "creative-writing",
        "chinese-novelist", "long-novel", "metanovel",
        "goal-writer", "serenity-skill", "md_to_anki",
        "nuwa-skill", "editorial-card-generator",
        "autonovel", "storycraftr", "longwriter",
        "writeagent", "writehere", "creativewriter",
        "ai-flavor-remover", "prompt-optimizer",
        "prompts.chat", "superprompt", "gpt-prompt-engineer",
        "prompt-engineering-guide",
        "obsidian-skills", "obsidian-second-brain",
        "life-system", "second-brain", "mempalace",
        "autogoals", "get-shit-done",
        "marketing-handbook", "marketingskills",
        "pdf2skills", "paperclip",
        "content-pipeline", "huashu-md-html",
        "creative-writing-skills",
        "auto-claude-writing",
        "mumuainovel", "arboris-novel",
        "screen-creative-skills",
        "tanweai/pua",
        # additional
        "novel-summarizer", "readreamai",
        "echo-chamber", "novel entirely",
        "servilia", "worldbuilding",
        "notebook.ai", "indentlabs/notebook",
        "editorial-ai", "ai wrote this",
        "patentwriter",
    ]
    if has_kw(name, writing_kw) or has_kw(desc, writing_kw):
        matched.append("写作")

    # ==========================================
    # Priority 6: 翻译与文档
    # ==========================================
    trans_kw = [
        "bilingual_book_maker", "ebook-translator", "bilingual",
        "pdf2epub", "rtranslator", "babeldoc",
        "mineru", "umi-ocr", "paddleocr",
        "opendataloader-pdf", "opendatalab/mineru",
        "cloud-document-converter", "ai-media2doc",
        "doocs/md", "doocs/cose",
        "wenyan-mcp", "caol64/wenyan",
        "markdown-viewer-extension",
        "nextai-translator",
        "translate-book",
        # additional
        "ainiee", "ai翻译", "epub txt",
        "minghao-wu/transagents",
        "transagent",
    ]
    if has_kw(name, trans_kw) or has_kw(desc, trans_kw):
        matched.append("翻译与文档")

    # ==========================================
    # Priority 7: 自动化工作流
    # ==========================================
    workflow_kw = [
        "n8n", "dify", "flowise",
        "open-dynamic-workflows", "workflow-cookbook",
        "awesome-dify-workflow", "dify-schedule",
        "n8n-nodes", "n8n-i18n", "n8n-free-templates",
        "awesome-n8n", "n8n-workflows",
        "larksuite/cli",
        # additional
        "iflow-cli", "iflow cli",
        "automa", "browser extension for automating",
        "open-lovable", "clone and recreate any website",
    ]
    if has_kw(name, workflow_kw) or has_kw(desc, workflow_kw):
        matched.append("自动化工作流")

    # ==========================================
    # Priority 8: 网络与代理
    # ==========================================
    network_kw = [
        "edgetunnel", "shadowrocket", "clash-verge",
        "free-proxy-list", "greatfire/wiki",
        "cursor-vip", "cursor-fake-machine", "go-cursor-help",
        "cursor-auto-free", "windsurf-vip-free", "ai-auto-free",
        "freeclaude35", "nofx",
        "cloakbrowser", "camofox-browser",
        "tandem-browser", "bb-browser", "dev-browser",
        "zizifn/edgetunnel", "cmliu/edgetunnel",
        "freedomain",
        # additional
        "openai-gemini", "gemini ➜ openai",
        "gemini-cli-openai", "expose gemini",
        "jskeaaa/cursor_pro",
        "deepreasoning", "inference api",
        "linkswift", "网盘直链",
    ]
    if has_kw(name, network_kw) or has_kw(desc, network_kw):
        matched.append("网络与代理")

    # ==========================================
    # Priority 9: 数据分析与金融
    # ==========================================
    data_fin_kw = [
        "stock_analysis", "stock", "trading", "finance", "qlib",
        "financial-services", "finglm", "openbb",
        "deepAnalyze", "db-gpt", "deep-searcher",
        "data-analysis", "data-science",
        "daily_stock", "vnpy", "tradingagents",
        "dexter", "jimureport",
        "milvus", "maxkb", "ragflow", "ultrarag", "rag-anything",
        "ai-analyst", "company-research",
        "ai-data-science-team", "probly",
        "timesfm", "khoj-ai/khoj", "refly",
        # additional
        "kronos", "financial market",
        "qbot", "量化交易", "quantitative",
        "deep-research", "deep research report",
        "ruc-datalab/deepanalyze",
        "patentwriter",
    ]
    if has_kw(name, data_fin_kw) or has_kw(desc, data_fin_kw):
        matched.append("数据分析与金融")

    # ==========================================
    # Priority 10: 社媒与内容
    # ==========================================
    social_kw = [
        "wechat", "weixin", "xiaohongshu", "xhs-",
        "bilibili", "mediacrawler",
        "xiaohongshuskills", "xiaohongshu-ops",
        "wechat-cli", "wechat-decrypt", "wechatdownload",
        "wechatbaktool", "cleanmywechat", "wechat-article",
        "weixin-agent-sdk", "weixin-devtools",
        "weapp-dev-mcp", "wxauto",
        "twitter-web-exporter", "redditvideomakerbot",
        "ai-contentcraft", "wewe-rss", "newsnow",
        "multipost-extension", "xhs_ai_publisher", "xhs-toolkit",
        "xhs-cover", "wx_channels_download",
        "social-auto-upload", "wxmp",
        "aiwechatauto", "chgjx",
        "1688-shopkeeper", "ecommerce-skills", "ecommerce-selector",
        "clawshop-inspiration", "clawshop-data",
        "cninfo2notebookllm",
        # additional
        "huixiangdou", "group chat",
        "aiwritex", "公众号", "舆情",
        "sillytavern", "llm frontend",
        "folo", "rss reader",
        "changedetection", "web page monitoring",
        "iniwap/aiwritex",
    ]
    if has_kw(name, social_kw) or has_kw(desc, social_kw):
        matched.append("社媒与内容")

    # ==========================================
    # Priority 11: API与逆向
    # ==========================================
    api_kw = [
        "ds2api", "chat2api", "gcli2api", "grok2api",
        "aiclient2api", "freellmapi", "cliproxyapi",
        "ai-model-bypass", "hackingtool",
        "jailbreak_llms", "geminiwatermark",
        "obscura", "hydro0x01",
        # additional
        "airllm", "405b llm", "8gb vram",
        "antirez/ds4", "deepseek 4 flash",
        "weclone", "ai twin", "chat logs",
        "freeaskinternet",
        "deep-chat", "chatbot component",
        "robertpiosik/codewebchat",
        "cherry-studio", "ai productivity studio",
    ]
    if has_kw(name, api_kw) or has_kw(desc, api_kw):
        matched.append("API与逆向")

    # ==========================================
    # Priority 12: 学习资料
    # ==========================================
    learning_kw = [
        "awesome-", "hello-algo", "hello-agents", "easy-vibe",
        "ai-engineering-from-scratch", "ai-coding-guide",
        "vibe-coding-cn", "prompt-engineering-guide",
        "awesome-deepseek", "github-chinese-top-charts",
        "chinese-independent-developer",
        "500-ai-agents", "awesome-llm-apps", "awesome-agents",
        "top-ai-tools", "ai-engineering-hub",
        "scientific-agent", "ai-agent-deep-dive",
        "translate-book", "edu-knowlege", "chinatextbook",
        "awesome-developer-go-sail", "context-engineering-intro",
        "bmad-method", "awesome-vibe-coding",
        "system-prompts-and-models",
        "full-self-coding", "awesome-useful-websites",
        "best-windows-apps", "free-for-dev",
        "joke-dataset", "mnbvc", "backlog.md", "agents.md",
        "ai-news-radar", "trendfinder",
        "1000userguide", "ebook-treasure",
        "programthink/books", "kska32/ebooks", "walker96/some-books",
        "hands-on-llm", "hands-on-large-language",
        "google-gemini/cookbook",
        "deepseek-ai/awesome", "awesome-fantasy",
        # additional
        "study-flashcards", "ankigpt",
        "llm_wiki", "llm wiki",
        "ai-project-gallery",
        "aipmer/book", "codex实战",
        "paper2code", "code generation from",
        "qianguyihao/web", "前端图文教程",
        "tianya", "天涯神贴",
        "alantang1977/x",
        "deploy-your-own-saas",
        "one-person-company", "vibe 力学",
        "ai-money-maker-handbook", "ai副业",
        "aitoearn", "ai to earn",
        "oh-my-foss-android",
        "mswnlz/edu-knowlege",
        "freeaskinternet", "search aggregator",
    ]
    if has_kw(name, learning_kw) or has_kw(desc, learning_kw):
        matched.append("学习资料")

    # ==========================================
    # Priority 13: AI Agent (broader category)
    # ==========================================
    agent_kw = [
        "openmanus", "openhands", "archon", "deer-flow",
        "genericagent", "autoresearch", "proactiveagent",
        "agent-builder", "ai-agent-builder",
        "craft-ai-agents", "metagpt", "roma",
        "cowagent", "astron-agent", "everos", "luogen",
        "agenticseek", "zeroshot",
        "autocode", "docker/docker-agent",
        "auto-company", "builderpulse",
        "autoresearchclaw", "ai-dev-tasks",
        "second-me", "oasis",
        "skills-manager", "skill2app", "skill-anything",
        "show-me-the-money", "james-design",
        "ralph", "happy",
        "vanna-ai/vanna", "wrenai",
        "pi/", "elementsix-skills",
        "baoyu-skills", "ljg-skills",
        "dbskill", "goskill",
        "valuecell", "muse",
        "gnhf",
        # additional
        "browser-use", "browser harness",
        "browser-use/browser-use",
        "yingdao_robot", "ying-dao",
        "hermes-agent", "hermes agent",
        "724-office", "self-evolving ai agent",
        "vibetunnel", "command your agents",
        "agency-agents", "ai agency",
        "pinokio", "ai browser",
        "contains-studio/agents",
        "youtu-agent", "agent framework",
        "dp-archive/archive", "skill compose",
        "earendil-works/pi", "agent toolkit",
        "owl", "optimized workforce",
        "web-ui", "run ai agent",
        "rpamis/comet", "agent skill harness",
        "wong2/weixin-agent-sdk",
        "acontext", "agent skills as a memory",
        "feiniaoyun", "memex", "file system based wiki",
        "open-construction", "construction erp",
        "datadrivenconstruction",
        "huiwenmincho",
        "defou-workflow-agent",
        "wangziqi06/724-office",
    ]
    if has_kw(name, agent_kw) or has_kw(desc, agent_kw):
        matched.append("AI Agent")

    # Default: if no group matched
    if not matched:
        # Final fallback: try broader patterns for remaining repos
        # CC工具: marp (markdown presentation), codex-related, skill systems
        if any(k in all_text for k in [
            "marp", "codex", "skill", "claude", "codex task",
            "waza", "engineering habits",
            "llm-wiki-skill", "llm wiki",
            "shiji-kb", "knowledge base",
            "frontend-slides", "coding agent",
            "opencli", "make any website into cli",
            "cli-anything", "agent-native",
            "tencentmap",
            "moltbot",
        ]):
            matched.append("CC工具")
        # 图像视频
        elif any(k in all_text for k in [
            "mirofish", "swarm intelligence", "predicting anything",
            "viga", "vision-as-inverse-graphics",
            "node-banana", "generative workflow",
            "bananapod", "创意板",
            "pallaidium", "generative ai movie studio",
            "turbodiffusion", "video diffusion",
            "vimax", "agentic video generation",
            "infinitetalk", "talking video generation",
            "直播源", "直播",
        ]):
            matched.append("图像视频")
        # 写作
        elif any(k in all_text for k in [
            "novel-summarizer", "qmd", "mini cli search engine",
            "prompts for different life",
            "genesis-mnemosyne", "narrative platform",
            "mind-elixir", "mind map",
            "tinymind", "blog",
            "hackingtool", "hacking toolkit",
        ]):
            matched.append("写作")
        # 学习资料
        elif any(k in all_text for k in [
            "open-source-games",
            "tfx-for-windows", "file explorer for windows",
            "hugo", "framework for building websites",
        ]):
            matched.append("学习资料")
        # AI Agent
        elif any(k in all_text for k in [
            "openzep", "mirofishopt",
            "crawlee", "web scraping",
            "crawl4ai", "web crawler",
            "meridian", "news noise",
            "ape", "prompt engineer",
            "meetily", "meeting assistant",
            "iliane5/meridian",
            "podlm",
            "waoowaoo", "ai agent platform",
            "gpt-games", "build games with gpt",
            "fabric", "anus-dev",
        ]):
            matched.append("AI Agent")
        # 自动化工作流
        elif any(k in all_text for k in [
            "transformerlab", "train, evaluate, and scale",
            "community-plugins", "cursor community",
        ]):
            matched.append("自动化工作流")
        # 翻译与文档
        elif any(k in all_text for k in [
            "marker", "pdf to markdown",
            "datalogic",
        ]):
            matched.append("翻译与文档")
        # 数据分析与金融
        elif any(k in all_text for k in [
            "calorific", "calorie tracker", "nutritracker",
            "nutrients-per-calorie", "usda",
            "calorie-calculator", "calculate the calories",
        ]):
            matched.append("数据分析与金融")
        # 社媒与内容
        elif any(k in all_text for k in [
            "sillytavern-docs-zh", "sillytavern-chub",
            "sillytavern-settings",
        ]):
            matched.append("社媒与内容")
        # 网络与代理
        elif any(k in all_text for k in [
            "ai-worker", "cloudflare worker",
        ]):
            matched.append("网络与代理")
        # API与逆向
        elif any(k in all_text for k in [
            "ollama", "get up and running",
        ]):
            matched.append("API与逆向")
        else:
            matched.append("开发工具")

    return matched

# Classify
group_defs = {
    "CC工具":       {"color": "#f0883e"},
    "图像视频":      {"color": "#a371f7"},
    "写作":         {"color": "#3fb950"},
    "学习资料":      {"color": "#58a6ff"},
    "AI Agent":     {"color": "#f778ba"},
    "MCP工具":      {"color": "#79c0ff"},
    "自动化工作流":   {"color": "#d2a8ff"},
    "翻译与文档":    {"color": "#7ee787"},
    "网络与代理":    {"color": "#ff7b72"},
    "数据分析与金融":  {"color": "#ffa657"},
    "社媒与内容":    {"color": "#d29922"},
    "语音与音乐":    {"color": "#56d364"},
    "开发工具":      {"color": "#8b949e"},
    "API与逆向":    {"color": "#da3633"},
}

classified = {g: [] for g in group_defs}
repo_groups = {}  # track which groups each repo belongs to

for r in repos:
    matched = classify_repo(r)
    repo_groups[r["full_name"]] = matched
    for g in matched:
        classified[g].append(r["full_name"])

# Build export JSON
counter = 0
def gen_id():
    global counter
    counter += 1
    return f"g-{counter}"

export_data = {
    "version": 1,
    "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "username": "yuyunzhi2",
    "groups": {},
    "auto_group_rules": [
        {"name": "CC工具", "keywords": ["claude-code", "claude code", "openclaw", "claw", "codex", "antigravity", "superpowers"], "topics": ["claude-code", "openclaw"]},
        {"name": "图像视频", "keywords": ["video", "image", "comfyui", "diffusion", "seedance", "storyboard", "kolors", "ppt", "slide", "movie"], "topics": ["video", "image-generation", "comfyui"]},
        {"name": "写作", "keywords": ["writing", "novel", "creative-writing", "author", "story", "obsidian", "memo", "markdown"], "topics": ["writing", "creative-writing"]},
        {"name": "学习资料", "keywords": ["awesome", "guide", "tutorial", "book", "course", "learn", "handbook"], "topics": ["awesome", "education"]},
        {"name": "AI Agent", "keywords": ["agent", "autonomous", "multi-agent", "manus", "openhands", "archon"], "topics": ["ai-agent", "llm"]},
        {"name": "MCP工具", "keywords": ["mcp", "model-context-protocol"], "topics": ["mcp"]},
        {"name": "自动化工作流", "keywords": ["n8n", "dify", "workflow", "automation", "flowise"], "topics": ["n8n", "dify", "workflow"]},
        {"name": "翻译与文档", "keywords": ["translate", "bilingual", "ebook", "pdf", "ocr", "document", "mineru"], "topics": ["translation", "ocr"]},
        {"name": "网络与代理", "keywords": ["proxy", "vpn", "clash", "edgetunnel", "bypass"], "topics": ["proxy", "vpn"]},
        {"name": "数据分析与金融", "keywords": ["stock", "trading", "finance", "quant", "data-analysis", "rag"], "topics": ["finance", "data-analysis"]},
        {"name": "社媒与内容", "keywords": ["wechat", "xiaohongshu", "xhs", "bilibili", "social", "crawler"], "topics": ["wechat", "social-media"]},
        {"name": "语音与音乐", "keywords": ["tts", "voice", "speech", "audio", "music"], "topics": ["tts", "speech"]},
        {"name": "开发工具", "keywords": ["cli", "framework", "sdk", "library", "tool", "editor"], "topics": ["cli", "developer-tools"]},
        {"name": "API与逆向", "keywords": ["api", "reverse", "decrypt", "hack", "bypass", "chat2api"], "topics": ["api"]},
    ]
}

for group_name, info in group_defs.items():
    repo_list = classified[group_name]
    if not repo_list:
        continue
    gid = gen_id()
    export_data["groups"][gid] = {
        "name": group_name,
        "color": info["color"],
        "repos": repo_list
    }

output_path = r"D:\git\github-stars-group-manager\github-stars-groups-yuyunzhi2-2026-06-20.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(export_data, f, ensure_ascii=False, indent=2)

# Stats
print("=== 分类统计 ===")
total_assigned = 0
for g in group_defs:
    count = len(classified[g])
    total_assigned += count
    print(f"  {g}: {count}")
print(f"\n  总分配(含跨组): {total_assigned}")
print(f"  实际仓库: {len(repos)}")

# Show repos that only landed in 开发工具 (the default)
dev_only = [r["full_name"] for r in repos if repo_groups[r["full_name"]] == ["开发工具"]]
if dev_only:
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    print(f"\n=== 仅分到「开发工具」的仓库 ({len(dev_only)}个) ===")
    for rn in dev_only:
        rd = next(r for r in repos if r["full_name"] == rn)
        desc = rd.get('description', '') or ''
        print(f"  {rn} - {desc[:80]}")
