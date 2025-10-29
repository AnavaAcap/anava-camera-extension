#!/usr/bin/env python3
"""
Generate extension icons from Anava favicon
Resizes anava-favicon-source.png to required sizes
"""

from PIL import Image
import os

# Ensure dist directory exists
os.makedirs('dist', exist_ok=True)

FAVICON_SOURCE = 'anava-favicon-source.png'

def create_icon_from_favicon(size, filename):
    """Resize favicon to target size"""
    try:
        # Open the original favicon
        img = Image.open(FAVICON_SOURCE)

        # Resize with high-quality resampling
        img_resized = img.resize((size, size), Image.Resampling.LANCZOS)

        # Save as PNG
        img_resized.save(filename, 'PNG')
        print(f"✓ Created {filename} ({size}x{size})")
        return True
    except Exception as e:
        print(f"❌ Failed to create {filename}: {e}")
        return False

if __name__ == '__main__':
    # Check if source favicon exists
    if not os.path.exists(FAVICON_SOURCE):
        print(f"❌ {FAVICON_SOURCE} not found. Downloading...")
        import subprocess
        result = subprocess.run(['curl', '-s', 'https://anava.ai/favicon.ico', '-o', FAVICON_SOURCE])
        if result.returncode != 0:
            print("❌ Failed to download favicon")
            exit(1)
        print(f"✓ Downloaded {FAVICON_SOURCE}")

    # Create all three icon sizes from the favicon
    success = True
    success = create_icon_from_favicon(16, 'dist/icon16.png') and success
    success = create_icon_from_favicon(48, 'dist/icon48.png') and success
    success = create_icon_from_favicon(128, 'dist/icon128.png') and success

    if success:
        print("✓ All icons created successfully from Anava favicon!")
    else:
        print("❌ Some icons failed to create")
        exit(1)
