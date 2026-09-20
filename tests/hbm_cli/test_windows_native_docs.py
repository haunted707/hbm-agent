from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    # The launchers live in the managed binary dir OUTSIDE the git checkout
    # (HBM_HOME\bin, next to the managed uv) — NOT the whole venv\Scripts
    # (which would shadow the user's python, #83797) and NOT a dir inside
    # the checkout (which `hbm update`'s autostash swept off disk).
    assert "%LOCALAPPDATA%\\hbm\\bin" in doc
    assert (
        "Get-Command hbm        # should print "
        "C:\\Users\\<you>\\AppData\\Local\\hbm\\bin\\hbm.exe"
    ) in doc
    # Installer exposes $HbmHome\bin, and must copy the launchers into it.
    assert '$hbmBin = "$HbmHome\\bin"' in install
    assert "hbm.exe" in install and "hbm-acp.exe" in install
    # Guard against regressions to either legacy layout.
    assert '$hbmBin = "$InstallDir\\venv\\Scripts"' not in install
    assert '$hbmBin = "$InstallDir\\bin"' not in install
