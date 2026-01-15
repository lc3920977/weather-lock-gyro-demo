# weather-lock-gyro-demo
天气锁屏陀螺仪 Demo

night 场景已接入 stars/moon/meteor/water_reflect 四层 PNG 叠加效果。

调试：点击 HUD 面板中的 Debug 区块按钮可查看 BUILD_ID、当前 scene、层数量、每层加载状态/尺寸/最终 src，并通过按钮切换隐藏 Lock UI、强制可见、显示边框或显示 layer vectors 来定位叠加层不显示问题。

Parallax 强度：HUD 中提供 Low / High，可即时观察分层视差变化。

移动端全屏测试：
- Android Chrome：菜单 → 添加到主屏幕 → 以应用方式打开（standalone）。
- iOS Safari：分享 → 添加到主屏幕 → 从桌面打开（standalone）。

夜景修复验证：
- 打开 Debug: show layer vectors，可看到 stars/meteor/water_reflect/moon 的 dx/dy/rotX/rotY/scale 数值。
- water_reflect 的 dy 与 rotX/rotY 恒为 0；moon 的 dy 被限制在屏幕高度约 1/3 范围内；stars/meteor 的 dx/dy 被 clamp，始终可见。
