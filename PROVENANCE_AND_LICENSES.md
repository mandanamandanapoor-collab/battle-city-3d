# Battle City 3D — Asset Provenance & License Notice

## 1. Audio Provenance (15 Collected Remake OGG Cues)
The 15 `.ogg` sound cues in `public/audio/` are collected NES-style remake audio samples sourced from:
- **Repository**: `JustoSenka/BattleCity`
- **Commit**: `3a07004ba8e53baea74ff70d2ecc22b017eb9b20`
- **Nature of Audio**: Collected remake audio samples (not claimed to be a bit-perfect Famicom/NES hardware capture).
- **Files**:
  1. `levelstarting.ogg` (4.333s stage opening fanfare)
  2. `shoot.ogg` (cannon firing)
  3. `moving.ogg` (tank driving loop)
  4. `nmoving.ogg` (tank engine idling loop)
  5. `brickhit.ogg` (shell impact on brick wall)
  6. `steelhit.ogg` (shell impact on steel block)
  7. `eexplosion.ogg` (enemy tank destruction explosion)
  8. `fexplosion.ogg` (player tank / headquarters explosion)
  9. `tbonushit.ogg` (supply appearance / flashing enemy hit)
  10. `bonus.ogg` (supply collection)
  11. `life.ogg` (extra life awarded)
  12. `shieldhit.ogg` (heavy tank armor hit / shield deflection)
  13. `ice.ogg` (ice traction slip)
  14. `pause.ogg` (pause toggle chime)
  15. `gameover.ogg` (game over jingle)

### Repository License (`JustoSenka/BattleCity`)
```text
MIT License

Copyright (c) 2020 Evgeny Senkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. 3D Model Slots Inventory (17 Replaceable Slots)
All 17 slots are grounded at `y = 0`, normalized in scale and forward orientation, and stored in `public/models/<slot>.glb` with procedural comparison equivalents in Three.js mode:
- **Core Vehicles & Base (4)**: `player`, `enemy`, `heavy`, `eagle`
- **Collectible Supplies (10)**: `pickup-star`, `pickup-helmet`, `pickup-clock`, `pickup-shovel`, `pickup-life`, `pickup-grenade`, `pickup-ammo`, `pickup-repair`, `pickup-magnet`, `pickup-boost`
- **Environment Scenery (3)**: `environment-building` (Tripo P2.0 target 1,800 tris), `environment-tree` (Tripo P2.0 target 1,100 tris), `environment-bush` (Tripo P2.0 target 650 tris)
