"""
Library — View and manage saved blueprints.
"""
import streamlit as st
import json
import os
from pathlib import Path

st.markdown("# 📚 Blueprint Library")

# Check for saved blueprints
blueprint_dir = Path("data/blueprints")
blueprint_dir.mkdir(parents=True, exist_ok=True)

# Current session blueprint
if st.session_state.get('blueprint'):
    bp = st.session_state['blueprint']
    st.markdown("### Current Session")

    col1, col2, col3 = st.columns([3, 1, 1])
    col1.markdown(f"**{bp.get('trackName', 'Unknown')}** — {bp.get('cornerCount', '?')} corners")
    col2.markdown(f"{bp.get('vehicleType', 'car').title()}")

    if col3.button("💾 Save to Library"):
        track = bp.get('trackName', 'blueprint').replace(' ', '_').replace('/', '_')
        filepath = blueprint_dir / f"{track}.json"
        with open(filepath, 'w') as f:
            json.dump(bp, f, indent=2, default=str)
        st.success(f"Saved to {filepath.name}")
        st.rerun()

    st.divider()

# Saved blueprints
st.markdown("### Saved Blueprints")

saved_files = sorted(blueprint_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)

if not saved_files:
    st.info("No saved blueprints yet. Build one in the Builder page!")
else:
    for filepath in saved_files:
        try:
            with open(filepath) as f:
                bp = json.load(f)

            col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
            col1.markdown(f"**{bp.get('trackName', filepath.stem)}**")
            col2.markdown(f"{bp.get('cornerCount', '?')} corners")
            col3.markdown(f"{bp.get('vehicleType', '').title()}")

            if col4.button("Load", key=f"load_{filepath.name}"):
                st.session_state['blueprint'] = bp
                st.success(f"Loaded {bp.get('trackName', filepath.stem)}")

        except Exception as e:
            st.warning(f"Error loading {filepath.name}: {e}")
