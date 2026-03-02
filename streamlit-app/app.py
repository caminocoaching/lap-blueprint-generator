"""
Lap Blueprint Generator — Quiet Eye Conditioning System
Streamlit Edition
"""
import streamlit as st
import json
import os

# ── Persistent API Key Storage ───────────────────────────
# Keys saved to a local .keys.json file so they survive browser refresh
_KEYS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.keys.json')

def _load_saved_keys():
    """Load API keys from local file."""
    if os.path.exists(_KEYS_FILE):
        try:
            with open(_KEYS_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}

def _save_keys(keys_dict):
    """Save API keys to local file."""
    try:
        with open(_KEYS_FILE, 'w') as f:
            json.dump(keys_dict, f)
    except IOError:
        pass

# Load saved keys into session state on first run
# Priority: 1) Streamlit secrets (set in Cloud dashboard) 2) .keys.json 3) manual input
if 'keys_loaded' not in st.session_state:
    # First try Streamlit secrets (survives reboots on Streamlit Cloud)
    try:
        if hasattr(st, 'secrets'):
            for secret_key, state_key in [('GEMINI_KEY', 'gemini_key'), ('CLAUDE_KEY', 'claude_key')]:
                val = st.secrets.get(secret_key, '')
                if val and state_key not in st.session_state:
                    st.session_state[state_key] = val
    except Exception:
        pass

    # Then try .keys.json (local persistence)
    saved = _load_saved_keys()
    for k, v in saved.items():
        if v and k not in st.session_state:
            st.session_state[k] = v
    st.session_state['keys_loaded'] = True

st.set_page_config(
    page_title="Lap Blueprint — Quiet Eye",
    page_icon="🏁",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS for dark motorsport theme ─────────────────
st.markdown("""
<style>
    .stApp { background-color: #0a0a0f; }
    h1, h2, h3 { color: #00f0ff !important; }
    .stSidebar { background-color: #16161e; }
    .css-1d391kg { background-color: #16161e; }

    /* Cyan accent buttons */
    .stButton > button {
        background: linear-gradient(135deg, #00f0ff, #8b5cf6);
        color: white;
        border: none;
        font-weight: 600;
    }
    .stButton > button:hover {
        background: linear-gradient(135deg, #00d4e0, #7c3aed);
    }

    /* Card styling */
    .blueprint-card {
        background: #16161e;
        border: 1px solid #2a2a35;
        border-radius: 12px;
        padding: 20px;
        margin: 10px 0;
    }
    .cue-card {
        background: #1a1a25;
        border-left: 3px solid #00f0ff;
        padding: 12px 16px;
        margin: 6px 0;
        border-radius: 0 8px 8px 0;
    }
    .cue-eyes { color: #00f0ff; font-weight: 600; }
    .cue-aware { color: #ff9f1c; }

    /* Progress styling */
    .stProgress > div > div { background-color: #00f0ff; }
</style>
""", unsafe_allow_html=True)


# ── Sidebar: API Key Management ──────────────────────────
with st.sidebar:
    st.image("https://img.icons8.com/fluency/48/lap-counter.png", width=40)
    st.title("LAP BLUEPRINT")
    st.caption("Quiet Eye Builder")

    st.divider()

    # API Keys section
    with st.expander("🔑 API Keys", expanded=not all([
        st.session_state.get('gemini_key'),
        st.session_state.get('claude_key'),
    ])):
        st.caption("Keys are stored in your session — never sent anywhere except the API providers.")

        # Try to load from secrets first
        default_gemini = st.secrets.get("GEMINI_KEY", "") if hasattr(st, 'secrets') else ""
        default_claude = st.secrets.get("CLAUDE_KEY", "") if hasattr(st, 'secrets') else ""

        gemini_key = st.text_input(
            "Gemini API Key",
            value=st.session_state.get('gemini_key', default_gemini),
            type="password",
            help="For video analysis + track map reading. Get yours at aistudio.google.com"
        )
        claude_key = st.text_input(
            "Claude API Key",
            value=st.session_state.get('claude_key', default_claude),
            type="password",
            help="For blueprint generation + guide enrichment. Get yours at console.anthropic.com"
        )

        # Auto-save to session state AND persist to local file
        if gemini_key:
            st.session_state['gemini_key'] = gemini_key
        if claude_key:
            st.session_state['claude_key'] = claude_key

        # Persist keys to disk so they survive refresh
        _save_keys({
            'gemini_key': gemini_key,
            'claude_key': claude_key,
        })

        # Status indicators
        cols = st.columns(2)
        cols[0].markdown(f"{'✅' if gemini_key else '❌'} Gemini")
        cols[1].markdown(f"{'✅' if claude_key else '❌'} Claude")

    # Model selection
    with st.expander("⚙️ Model Settings"):
        gemini_model = st.selectbox(
            "Gemini Model",
            ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
            help="Flash recommended for speed/cost balance"
        )
        st.session_state['gemini_model'] = gemini_model

        claude_model = st.selectbox(
            "Claude Model",
            ["claude-sonnet-4-5-20250929", "claude-opus-4-5-20251101"],
            help="Sonnet recommended for blueprint generation"
        )
        st.session_state['claude_model'] = claude_model

        vehicle_type = st.selectbox(
            "Vehicle Type",
            ["car", "motorcycle", "kart", "formula"],
        )
        st.session_state['vehicle_type'] = vehicle_type

    st.divider()
    st.caption("Built with Quiet Eye science by Joan Vickers")


# ── Landing Page ─────────────────────────────────────────
st.markdown("### 🏁 QUIET EYE CONDITIONING")
st.markdown("# *What would a good lap* ***feel*** *like?*")
st.markdown("""
Close your eyes. See the track. Feel the flow before you ride it.

This system builds a **5-lap progressive conditioning video** that programs
your subconscious for automatic, in-flow performance — powered by two AIs
working together to understand the track and place precise gaze markers.
""")

# Quick start
col1, col2 = st.columns([2, 1])

with col1:
    st.markdown("### The Pipeline")
    st.markdown("""
    <div class="blueprint-card">
    <strong style="color:#00f0ff;">Step 1 — Data Collection</strong><br>
    Track name + map + guide. The AI needs to understand the layout first.<br><br>

    <strong style="color:#00f0ff;">Step 2 — Track Analysis</strong><br>
    Gemini reads the track map + Claude enriches with guide data.<br>
    Builds a complete track model before watching any video.<br><br>

    <strong style="color:#00f0ff;">Step 3 — Upload &amp; Trim Video</strong><br>
    Onboard footage. Trim to a single clean lap.<br><br>

    <strong style="color:#00f0ff;">Step 4 — Video Analysis (Forward + Reverse)</strong><br>
    Gemini watches the video WITH track context, then reverse-validates<br>
    every gaze chain from exit → entry (Quiet Eye principle).<br><br>

    <strong style="color:#00f0ff;">Step 5 — Generate QE Blueprint</strong><br>
    Claude builds the 4-cue gaze sequence for every corner.<br><br>

    <strong style="color:#00f0ff;">Step 6 — Export</strong><br>
    PDF blueprint + JSON + full 5-lap protocol MP4 (web-ready).
    </div>
    """, unsafe_allow_html=True)

    st.markdown("")
    if st.button("🚀 Start Building", type="primary", use_container_width=True):
        st.switch_page("pages/1_Builder.py")

with col2:
    st.markdown("### Two AIs, One Track")
    st.markdown("""
    <div class="blueprint-card">
    <strong style="color:#ff9f1c;">Gemini</strong><br>
    Visual engine — reads track maps, watches onboard footage,<br>
    detects corners, timestamps gaze targets,<br>
    runs forward + reverse passes.<br><br>
    <strong style="color:#ff9f1c;">Claude</strong><br>
    Blueprint brain — enriches track guides, 4-step deterministic<br>
    pipeline builds QE gaze sequences using Quiet Eye science.
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### 5-Lap Protocol")
    st.markdown("""
    <div class="blueprint-card">
    <strong style="color:#00f0ff;">L1-L2:</strong> Full Pause — 5s at each gaze point<br>
    <strong style="color:#00f0ff;">L3:</strong> Slow Lap — Full cues, no pauses<br>
    <strong style="color:#00f0ff;">L4:</strong> Normal Pace — Awareness cues only<br>
    <strong style="color:#00f0ff;">L5:</strong> Fast Lap — Marker icons only
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### The Four Cues")
    st.markdown("""
    <div class="cue-card"><span class="cue-eyes">1.</span> Eyes Braking Marker — Aware Apex</div>
    <div class="cue-card"><span class="cue-eyes">2.</span> Eyes Apex — Aware Exit</div>
    <div class="cue-card"><span class="cue-eyes">3.</span> Eyes Exit — Aware Straight</div>
    <div class="cue-card"><span class="cue-eyes">4.</span> Eyes Straight — Aware Braking Marker</div>
    """, unsafe_allow_html=True)
