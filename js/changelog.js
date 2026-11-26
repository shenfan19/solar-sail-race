// Changelog shown in the About page, newest first. CHANGELOG.md in the repository holds the same entries in English.
// items: one list per language; a language without its own list shows the English one.
window.SailChangelog = [
  {
    v: '0.4.3', date: '2026-11-26', items: {
      en: ['A click on the dimmed area round any window closes it; for the results it opens the view of the flight.', 'In About, each author\'s email sits on the same line as the name.'],
      'zh-CN': ['点击任何弹窗外的暗色区域即可关闭弹窗；结果窗点外面则进入查看现场。', '关于页里两位作者的邮箱与姓名单位放在同一行。'],
      ja: ['どのウィンドウも外側の暗い部分をクリックすると閉じます。結果ウィンドウでは飛行の確認画面になります。', '「このゲームについて」で、作者のメールアドレスを名前と同じ行に表示します。']
    }
  },
  {
    v: '0.4.2', date: '2026-11-26', items: {
      en: ['The front page puts the two modes, missions and star race, in two large panels; the levels under them are smaller cards.', 'Interface languages are now English, Simplified Chinese and Japanese.'],
      'zh-CN': ['首页把仿真任务与星际竞速两种模式做成两块大面板，下面的关卡卡片缩小。', '界面语言改为英文、简体中文、日文三种。'],
      ja: ['トップページで、ミッションとスターレースの二つのモードを大きなパネルにし、その下のステージのカードを小さくしました。', '表示言語は英語、簡体字中国語、日本語の三つになりました。']
    }
  },
  {
    v: '0.4.1', date: '2026-11-25', items: {
      en: ['The results window can be closed to look at the finished flight: the camera turns and zooms, and a burnt sail shows where it happened. One button or Esc brings the results back.', 'Fixed: a burnt sail in the star race now says it overheated, and the flight bar shows the final time after the results.'],
      'zh-CN': ['结果窗口可以关闭，查看飞完或失控的现场：视角可旋转缩放，帆烧毁时标出出事位置和那颗星的过热圈。一个按钮或 Esc 回到结果。', '修正：星际竞速里帆烧毁时，提示说明是过热烧毁；关掉结果后飞行栏显示最终时间。'],
      ja: ['結果ウィンドウを閉じて、終わった飛行や失敗の現場を見られます。視点の回転・ズームができ、帆が焼けた場合はその場所と星の過熱圏を示します。ボタンか Esc で結果に戻ります。', '修正：スターレースで帆が焼けたときは過熱と表示し、結果を閉じた後の飛行バーに最終時間を表示します。']
    }
  },
  {
    v: '0.4.0', date: '2026-11-25', items: {
      en: ['Pause stops only the clock. The scene stays in view, the camera still turns and zooms, and the sail can be set while paused. Leaving the page no longer pauses. Restart and menu buttons sit in the flight bar.', 'Lock 2D, in the briefing of the warm-up mission and the star races: the sail only leans forward and back, so the flight never leaves the plane. Flat star fields have their own layout, medal times, records and reference ghost.', 'Changelog, author affiliations and emails in About.'],
      'zh-CN': ['暂停只停时钟：画面保留，暂停时仍可旋转缩放视角、调整帆面。离开页面不再自动暂停。重来和菜单按钮放进飞行界面右下角。', '锁定 2D：在热身任务与星际竞速的简报里开启，帆只能前后倾，飞行始终不离开平面。平面星场有自己的星位、奖牌线、纪录与参考幽灵。', '关于页加入更新记录，以及两位作者的单位与邮箱。'],
      ja: ['一時停止は時計だけを止めます。画面はそのまま残り、停止中も視点の回転・ズームと帆の操作ができます。ページを離れても自動で一時停止しません。リスタートとメニューのボタンを飛行画面に置きました。', '2D ロック：ウォームアップとスターレースのブリーフィングで有効にできます。帆は前後にしか傾かず、飛行は平面から外れません。平面の星場には専用の配置、メダルタイム、記録、参考ゴーストがあります。', '「について」に更新履歴と、作者二人の所属とメールアドレスを追加しました。']
    }
  },
  {
    v: '0.3.0', date: '2026-11-25', items: {
      en: ['Two modes: missions with real parameters, and a star race that is fiction on purpose.', 'Star race: open fields of 24, 40 and 60 fixed stars in a flattened disc. Start in the middle and cross the boundary sphere anywhere. Gravity, light and stellar wind keep their real laws and strengths.', 'Hangar: solar, electric and hybrid sails, and six attitude mechanisms that can be combined. How fast the sail turns is part of the simulation.', 'Replay codes record the craft; older codes still play.', 'Fixed: racing a pasted replay code failed.'],
      'zh-CN': ['两种模式：使用真实参数的仿真任务，以及明说虚构的星际竞速。', '星际竞速：24、40、60 颗固定恒星组成的压扁圆盘星场，从中央出发，越过边界球任意一处即完成。引力、光压、星风按真实规律和强度。', '机库：太阳帆、电动帆、混合帆三种帆型，六种可组合的姿态机构。帆面转向快慢计入仿真。', '回放码记录所用机型，旧回放码仍可回放。', '修正：用粘贴的回放码比赛时报错。'],
      ja: ['二つのモード：実際のパラメータによるミッションと、意図的なフィクションのスターレース。', 'スターレース：24、40、60 個の固定された恒星が平たい円盤に並ぶ開けた星場。中央から出発し、境界球をどこでも越えればゴール。重力・光・恒星風は実際の法則と強さ。', '格納庫：ソーラーセイル、電気帆、ハイブリッド帆と、組み合わせ可能な六種の姿勢制御機構。帆の向きを変える速さもシミュレーションに含まれます。', 'リプレイコードに機体を記録。古いコードも再生できます。', '修正：貼り付けたリプレイコードと競うとエラーになっていました。']
    }
  },
  {
    v: '0.2.0', date: '2026-11-25', items: {
      en: ['Named Solar Sail Race 谁谓河广, with Jiafu Liu as co-author.', 'Nine languages, following the browser; front page introduction; About page; quieter colours.', 'Phone layout: the menu fits one screen; version shown in the footer and About.'],
      'zh-CN': ['定名 Solar Sail Race 谁谓河广，刘家夫为并列作者。', '九种语言，跟随浏览器；首页介绍；关于页；配色更柔和。', '手机布局：菜单一屏放下；页脚与关于页显示版本号。'],
      ja: ['名称を Solar Sail Race 谁谓河广 とし、劉家夫を共同作者に。', '九言語に対応しブラウザの言語に従う。トップページの紹介、「について」ページ、落ち着いた配色。', 'スマートフォン表示：メニューが一画面に収まる。フッターと「について」にバージョンを表示。']
    }
  },
  {
    v: '0.1.0', date: '2026-11-13', items: {
      en: ['Deterministic sail simulation: a replay re-simulates bit-identically in every browser and in the verify tool.', 'Three missions: spiral out to Mars, solar polar orbit, Earth polar orbit.', 'Two control schemes, a tilt pad with a pilot guide, 3D views with presets and split view, gamepad support.'],
      'zh-CN': ['确定性帆仿真：回放在所有浏览器和校验工具里逐位重现。', '三个任务：螺旋飞到火星、太阳极轨、地球极轨。', '两种操控方案，带导引的倾斜盘，带预设视角与分屏的三维视图，支持手柄。'],
      ja: ['決定論的な帆のシミュレーション：リプレイはどのブラウザでも検証ツールでもビット単位で同じに再現。', '三つのミッション：火星へのらせん、太陽極軌道、地球極軌道。', '二つの操作方式、ガイド付き傾斜パッド、プリセット視点と分割表示の 3D ビュー、ゲームパッド対応。']
    }
  }
];
