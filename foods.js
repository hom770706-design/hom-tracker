// Food database — calories per serving, protein/carbs/fat in grams
const FOOD_DB = [
  // ── 主食 ──
  { name: '白飯 (100g)',          calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  { name: '白飯 (一碗 200g)',     calories: 260, protein: 5.4, carbs: 56.4, fat: 0.6 },
  { name: '糙米飯 (100g)',        calories: 111, protein: 2.6, carbs: 23.0, fat: 0.9 },
  { name: '地瓜 (100g)',          calories:  86, protein: 1.6, carbs: 20.1, fat: 0.1 },
  { name: '芋頭 (100g)',          calories: 112, protein: 1.5, carbs: 26.0, fat: 0.2 },
  { name: '燕麥片 (40g)',         calories: 152, protein: 5.3, carbs: 26.0, fat: 2.8 },
  { name: '全麥吐司 (1片)',       calories:  80, protein: 4.0, carbs: 15.0, fat: 1.5 },
  { name: '白吐司 (1片)',         calories:  75, protein: 2.5, carbs: 14.0, fat: 1.0 },
  { name: '義大利麵 (100g熟)',    calories: 158, protein: 5.8, carbs: 31.0, fat: 0.9 },
  { name: '冬粉 (一碗熟80g)',     calories:  79, protein: 0.1, carbs: 19.4, fat: 0.0 },
  { name: '米粉 (一碗熟120g)',    calories: 126, protein: 1.6, carbs: 28.0, fat: 0.4 },

  // ── 禽肉 ──
  { name: '雞胸肉 (100g)',        calories: 165, protein: 31.0, carbs: 0.0, fat:  3.6 },
  { name: '雞腿肉 去皮 (100g)',   calories: 165, protein: 28.0, carbs: 0.0, fat:  6.5 },
  { name: '雞腿肉 帶皮 (100g)',   calories: 209, protein: 26.0, carbs: 0.0, fat: 11.0 },
  { name: '雞翅 (100g)',          calories: 203, protein: 19.0, carbs: 0.0, fat: 14.0 },
  { name: '去骨雞腿排',           calories: 280, protein: 32.0, carbs: 0.0, fat: 16.0 },

  // ── 豬肉 ──
  { name: '豬里肌 (100g)',        calories: 143, protein: 22.0, carbs: 0.0, fat:  5.5 },
  { name: '豬梅花 (100g)',        calories: 263, protein: 17.0, carbs: 0.0, fat: 21.0 },
  { name: '豬五花 (100g)',        calories: 393, protein: 14.0, carbs: 0.0, fat: 37.0 },
  { name: '豬絞肉 (100g)',        calories: 263, protein: 18.0, carbs: 0.0, fat: 21.0 },

  // ── 牛肉 ──
  { name: '牛肉 瘦 (100g)',       calories: 200, protein: 27.0, carbs: 0.0, fat:  9.0 },
  { name: '牛肉 一般 (100g)',     calories: 250, protein: 26.0, carbs: 0.0, fat: 15.0 },
  { name: '牛排 (180g)',          calories: 360, protein: 45.0, carbs: 0.0, fat: 19.0 },

  // ── 海鮮 ──
  { name: '鮭魚 (100g)',          calories: 208, protein: 20.0, carbs: 0.0, fat: 13.0 },
  { name: '鯖魚 (100g)',          calories: 205, protein: 19.0, carbs: 0.0, fat: 13.0 },
  { name: '鮪魚罐頭 水浸 (100g)', calories: 116, protein: 26.0, carbs: 0.0, fat:  1.0 },
  { name: '蝦 (100g)',            calories:  99, protein: 24.0, carbs: 0.0, fat:  0.3 },
  { name: '花枝 (100g)',          calories:  92, protein: 16.0, carbs: 3.0, fat:  1.4 },
  { name: '蛤蜊 (100g可食部)',    calories:  35, protein:  6.0, carbs: 1.0, fat:  0.5 },
  { name: '吻仔魚 (50g)',         calories:  57, protein: 10.0, carbs: 0.0, fat:  1.5 },
  { name: '柴魚片 (10g)',         calories:  35, protein:  7.5, carbs: 0.0, fat:  0.4 },

  // ── 蛋 ──
  { name: '雞蛋 (1顆)',           calories:  72, protein:  6.0, carbs: 0.4, fat:  5.0 },
  { name: '水煮蛋 (1顆)',         calories:  68, protein:  6.0, carbs: 0.6, fat:  4.8 },
  { name: '荷包蛋 (1顆)',         calories:  90, protein:  6.3, carbs: 0.4, fat:  7.0 },
  { name: '茶葉蛋 (1顆)',         calories:  78, protein:  6.5, carbs: 0.5, fat:  5.0 },
  { name: '滷蛋 (1顆)',           calories:  85, protein:  7.0, carbs: 1.0, fat:  5.2 },
  { name: '溫泉蛋 (1顆)',         calories:  72, protein:  6.2, carbs: 0.4, fat:  5.1 },
  { name: '炒蛋 (2顆)',           calories: 185, protein: 12.0, carbs: 1.0, fat: 14.0 },
  { name: '蒸蛋 (1份)',           calories:  90, protein:  7.0, carbs: 2.0, fat:  5.5 },

  // ── 豆製品 ──
  { name: '嫩豆腐 (100g)',        calories:  55, protein:  5.0, carbs: 1.5, fat:  3.0 },
  { name: '板豆腐 (100g)',        calories:  76, protein:  8.0, carbs: 2.0, fat:  4.0 },
  { name: '雞蛋豆腐 (1塊100g)',   calories:  79, protein:  6.6, carbs: 2.3, fat:  4.7 },
  { name: '豆漿 無糖 (250ml)',    calories: 103, protein:  8.3, carbs: 7.0, fat:  3.5 },
  { name: '豆漿 有糖 (250ml)',    calories: 148, protein:  7.5, carbs:18.0, fat:  3.5 },
  { name: '毛豆 (100g)',          calories: 121, protein: 11.0, carbs: 9.0, fat:  5.0 },
  { name: '豆干 (100g)',          calories: 140, protein: 14.0, carbs: 4.0, fat:  7.5 },

  // ── 乳製品 ──
  { name: '全脂牛奶 (250ml)',     calories: 152, protein:  8.0, carbs:12.0, fat:  8.0 },
  { name: '低脂牛奶 (250ml)',     calories: 103, protein:  8.5, carbs:12.0, fat:  2.5 },
  { name: '希臘優格 (100g)',      calories:  97, protein:  9.0, carbs: 3.6, fat:  5.0 },
  { name: '無糖優格 (100g)',      calories:  59, protein:  3.5, carbs: 7.0, fat:  1.5 },
  { name: '起司片 (1片)',         calories:  70, protein:  4.5, carbs: 1.0, fat:  5.5 },
  { name: '茅屋起司 (100g)',      calories:  98, protein: 11.0, carbs: 3.4, fat:  4.3 },
  { name: '乳清蛋白 (1匙30g)',    calories: 120, protein: 24.0, carbs: 2.0, fat:  2.0 },
  { name: '蛋白質飲 (350ml)',     calories: 160, protein: 25.0, carbs:10.0, fat:  3.0 },

  // ── 蔬菜 ──
  { name: '青花菜 (100g)',        calories:  34, protein:  2.8, carbs: 7.0, fat:  0.4 },
  { name: '菠菜 (100g)',          calories:  23, protein:  2.9, carbs: 3.6, fat:  0.4 },
  { name: '高麗菜 (100g)',        calories:  25, protein:  1.3, carbs: 5.8, fat:  0.1 },
  { name: '小黃瓜 (100g)',        calories:  15, protein:  0.7, carbs: 3.6, fat:  0.1 },
  { name: '番茄 (100g)',          calories:  18, protein:  0.9, carbs: 3.9, fat:  0.2 },
  { name: '生菜 (100g)',          calories:  15, protein:  1.4, carbs: 2.9, fat:  0.2 },
  { name: '芹菜 (100g)',          calories:  16, protein:  0.7, carbs: 3.0, fat:  0.2 },
  { name: '玉米 (100g)',          calories:  86, protein:  3.3, carbs:19.0, fat:  1.4 },
  { name: '紅蘿蔔 (100g)',        calories:  41, protein:  0.9, carbs: 9.6, fat:  0.2 },
  { name: '洋蔥 (100g)',          calories:  40, protein:  1.1, carbs: 9.3, fat:  0.1 },
  { name: '香菇 (100g)',          calories:  34, protein:  2.2, carbs: 6.8, fat:  0.5 },

  // ── 水果 ──
  { name: '香蕉 (1條中)',         calories:  89, protein:  1.1, carbs:23.0, fat:  0.3 },
  { name: '蘋果 (1顆中)',         calories:  95, protein:  0.5, carbs:25.0, fat:  0.3 },
  { name: '橘子 (1顆)',           calories:  62, protein:  1.2, carbs:15.0, fat:  0.2 },
  { name: '奇異果 (1顆)',         calories:  61, protein:  1.1, carbs:15.0, fat:  0.5 },
  { name: '藍莓 (100g)',          calories:  57, protein:  0.7, carbs:14.0, fat:  0.3 },
  { name: '西瓜 (100g)',          calories:  30, protein:  0.6, carbs: 7.6, fat:  0.2 },
  { name: '芭樂 (100g)',          calories:  57, protein:  2.6, carbs:14.0, fat:  0.4 },
  { name: '葡萄 (100g)',          calories:  69, protein:  0.7, carbs:18.0, fat:  0.2 },

  // ── 台灣常見餐點 ──
  { name: '滷肉飯 (1碗)',         calories: 450, protein: 15.0, carbs:65.0, fat: 15.0 },
  { name: '牛肉麵 (1碗)',         calories: 550, protein: 30.0, carbs:70.0, fat: 15.0 },
  { name: '雞腿便當',            calories: 700, protein: 30.0, carbs:80.0, fat: 22.0 },
  { name: '排骨便當',            calories: 750, protein: 28.0, carbs:85.0, fat: 25.0 },
  { name: '控肉便當',            calories: 680, protein: 22.0, carbs:82.0, fat: 22.0 },
  { name: '雞腿飯 (自助餐)',      calories: 620, protein: 32.0, carbs:75.0, fat: 18.0 },
  { name: '蛋炒飯 (1碗)',         calories: 500, protein: 15.0, carbs:70.0, fat: 18.0 },
  { name: '陽春麵 (1碗)',         calories: 350, protein: 12.0, carbs:65.0, fat:  5.0 },
  { name: '乾麵 (1碗)',           calories: 380, protein: 10.0, carbs:68.0, fat:  7.0 },
  { name: '餛飩湯 (1碗)',         calories: 320, protein: 15.0, carbs:48.0, fat:  7.0 },
  { name: '蚵仔麵線 (1碗)',       calories: 280, protein: 10.0, carbs:50.0, fat:  5.0 },
  { name: '麻辣燙 (一般份)',      calories: 450, protein: 18.0, carbs:55.0, fat: 18.0 },
  { name: '蛋餅 (1份)',           calories: 280, protein: 10.0, carbs:30.0, fat: 13.0 },
  { name: '燒餅夾蛋',            calories: 380, protein: 12.0, carbs:52.0, fat: 14.0 },
  { name: '饅頭夾蛋',            calories: 350, protein: 14.0, carbs:55.0, fat:  8.0 },
  { name: '三明治 (一般)',        calories: 320, protein: 14.0, carbs:40.0, fat: 10.0 },
  { name: '蔥抓餅 加蛋',         calories: 380, protein: 10.0, carbs:44.0, fat: 18.0 },
  { name: '水餃 (10顆)',          calories: 360, protein: 18.0, carbs:50.0, fat: 10.0 },
  { name: '小籠包 (6顆)',         calories: 320, protein: 16.0, carbs:35.0, fat: 12.0 },
  { name: '漢堡 (速食)',          calories: 450, protein: 20.0, carbs:40.0, fat: 22.0 },
  { name: '炸雞腿 (1支)',         calories: 360, protein: 26.0, carbs:18.0, fat: 22.0 },
  { name: '鹽水雞 (100g)',        calories: 150, protein: 20.0, carbs: 3.0, fat:  6.0 },
  { name: '滷味拼盤 (一份)',      calories: 300, protein: 20.0, carbs:25.0, fat: 12.0 },
  { name: '鐵板燒 雞肉飯',       calories: 680, protein: 28.0, carbs:78.0, fat: 22.0 },

  // ── 飲料 ──
  { name: '珍珠奶茶 (700ml)',     calories: 400, protein:  3.0, carbs:78.0, fat:  8.0 },
  { name: '鮮奶茶 (500ml)',       calories: 200, protein:  5.0, carbs:30.0, fat:  6.0 },
  { name: '美式咖啡 無糖',       calories:   5, protein:  0.3, carbs: 0.0, fat:  0.0 },
  { name: '拿鐵 全脂 (350ml)',    calories: 190, protein:  9.0, carbs:18.0, fat:  8.0 },
  { name: '豆漿拿鐵 (350ml)',     calories: 140, protein:  8.0, carbs:17.0, fat:  4.0 },
  { name: '無糖綠茶 (500ml)',     calories:   5, protein:  0.0, carbs: 1.0, fat:  0.0 },
  { name: '運動飲料 (600ml)',     calories: 150, protein:  0.0, carbs:37.0, fat:  0.0 },
  { name: '柳橙汁 (250ml)',       calories: 112, protein:  1.7, carbs:26.0, fat:  0.5 },

  // ── 點心 / 零食 ──
  { name: '堅果 混合 (30g)',      calories: 180, protein:  5.0, carbs: 8.0, fat: 15.0 },
  { name: '杏仁 (30g)',           calories: 173, protein:  6.0, carbs: 6.0, fat: 15.0 },
  { name: '花生醬 (1大匙15g)',    calories:  95, protein:  4.0, carbs: 3.5, fat:  8.0 },
  { name: '巧克力 (1格10g)',      calories:  53, protein:  0.5, carbs: 5.8, fat:  3.0 },
  { name: '布丁 (1個)',           calories: 120, protein:  3.5, carbs:20.0, fat:  3.0 },
  { name: '仙貝 (10片)',          calories: 110, protein:  2.0, carbs:24.0, fat:  0.5 },
  { name: '洋芋片 (1小包35g)',    calories: 183, protein:  2.0, carbs:21.0, fat: 10.0 },
];
