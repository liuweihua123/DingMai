const db = require('./db');
const bcrypt = require('bcryptjs');

function seed() {
  // 创建默认管理员（如果不存在）
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount === 0) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hashedPw);
    console.log('已创建默认管理员：admin / admin123');
  }

  // 检查是否已有业务数据
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (count > 0) {
    console.log('数据库已有数据，跳过填充。');
    return;
  }

  console.log('正在填充初始数据...');

  // 分类
  const insertCategory = db.prepare('INSERT INTO categories (id, name, icon, count) VALUES (?, ?, ?, ?)');
  const categories = [
    ['finance', '金融投资', '💎', 156],
    ['tech', '科技互联网', '⚡', 203],
    ['real-estate', '地产建筑', '🏛️', 89],
    ['medical', '医疗健康', '🧬', 67],
    ['education', '教育培训', '📚', 94],
    ['retail', '零售消费', '🛍️', 112],
    ['energy', '能源化工', '🔥', 45],
    ['media', '传媒娱乐', '🎬', 78],
    ['legal', '法律咨询', '⚖️', 38],
    ['import', '进出口贸易', '🌐', 63],
  ];
  const insertCategories = db.transaction(() => {
    for (const c of categories) insertCategory.run(...c);
  });
  insertCategories();

  // 充值套餐
  const insertPlan = db.prepare('INSERT INTO plans (id, points, price, label, popular, bonus) VALUES (?, ?, ?, ?, ?, ?)');
  const plans = [
    [1, 100, 9.9, '体验包', 0, 0],
    [2, 500, 39.9, '标准包', 1, 50],
    [3, 1000, 69.9, '高级包', 0, 150],
    [4, 3000, 199.9, '尊享包', 0, 600],
  ];
  const insertPlans = db.transaction(() => {
    for (const p of plans) insertPlan.run(...p);
  });
  insertPlans();

  // 资源
  const insertResource = db.prepare(`
    INSERT INTO resources (title, category, region, intro, contact, tags, price, views, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const resources = [
    {
      title: '某知名投资机构合伙人',
      category: 'finance',
      region: '北京',
      intro: '国内顶级风投机构核心合伙人，专注于TMT和新消费赛道，管理基金规模超50亿。拥有20年投资经验，主导过多个独角兽项目的早期投资，在创投圈拥有极高的声誉和广泛的人脉网络。',
      contact: '张明远\n手机：138-0101-8888\n邮箱：zhang.my@topvc.com\n微信号：zmy_vc_partner\n公司：鼎峰资本',
      tags: JSON.stringify(['风投', '合伙人', 'TMT', '新消费']),
      price: 50,
      views: 2847,
      created_at: '2024-03-15 10:00:00',
    },
    {
      title: '头部电商平台供应链总监',
      category: 'retail',
      region: '上海',
      intro: '国内Top3电商平台供应链管理部门总监，负责全品类供应商管理和采购决策。拥有丰富的供应链资源整合经验，与数千家品牌商保持密切合作关系，对电商供应链体系有深刻理解。',
      contact: '李思涵\n手机：139-2121-6666\n邮箱：lisan@topecom.com\n微信号：lisan_supply\n公司：耀购集团',
      tags: JSON.stringify(['电商', '供应链', '采购', '平台']),
      price: 40,
      views: 1923,
      created_at: '2024-03-12 10:00:00',
    },
    {
      title: '大型三甲医院副院长',
      category: 'medical',
      region: '广州',
      intro: '华南地区知名三甲综合医院副院长，主任医师、博士生导师。在医疗管理领域深耕30余年，同时兼任多个医学会重要职务，对医疗行业政策和发展趋势有独到见解。',
      contact: '王建国\n手机：136-0202-9999\n邮箱：wjg@hosp-gd.com\n微信号：wjg_medical\n单位：南方大学附属第一医院',
      tags: JSON.stringify(['三甲医院', '副院长', '医疗管理']),
      price: 80,
      views: 3156,
      created_at: '2024-03-10 10:00:00',
    },
    {
      title: '知名律所高级合伙人',
      category: 'legal',
      region: '深圳',
      intro: '国内排名前十律所高级合伙人，专注于企业并购、资本市场和跨境投资领域。参与过数十起大型并购交易，总交易金额超过300亿元。同时担任多家上市公司独立董事。',
      contact: '陈雅琳\n手机：135-0755-7777\n邮箱：chenyl@toplaw.com\n微信号：chenyl_lawyer\n机构：正合律师事务所',
      tags: JSON.stringify(['律所', '合伙人', '并购', '资本市场']),
      price: 60,
      views: 1687,
      created_at: '2024-03-08 10:00:00',
    },
    {
      title: '互联网大厂技术VP',
      category: 'tech',
      region: '北京',
      intro: '某互联网大厂技术副总裁，负责核心业务线的技术架构和团队管理。带领千人技术团队，在分布式系统、AI应用等领域有深厚积累。前硅谷顶级科技公司资深架构师。',
      contact: '赵鹏飞\n手机：138-0100-5555\n邮箱：zhaopf@bigtech.com\n微信号：zpf_tech_vp\n公司：万象科技',
      tags: JSON.stringify(['技术VP', '架构师', 'AI', '大厂']),
      price: 70,
      views: 4231,
      created_at: '2024-03-05 10:00:00',
    },
    {
      title: '全国连锁教育集团CEO',
      category: 'education',
      region: '成都',
      intro: '全国连锁教育品牌创始人兼CEO，旗下拥有200+校区，覆盖K12和职业教育赛道。连续三年获评行业最具影响力人物，对教育行业商业模式创新有深刻洞察。',
      contact: '刘佳宁\n手机：137-0280-3333\n邮箱：ljn@edugroup.com\n微信号：ljn_edu_ceo\n公司：明德教育集团',
      tags: JSON.stringify(['教育', 'CEO', '连锁', 'K12']),
      price: 55,
      views: 2105,
      created_at: '2024-03-02 10:00:00',
    },
    {
      title: '顶级商业地产开发商总裁',
      category: 'real-estate',
      region: '上海',
      intro: '国内商业地产龙头企业总裁，主导开发了多个城市地标级商业综合体项目。在地产行业拥有超过25年的从业经验，对城市综合体开发、商业运营有独到的商业眼光。',
      contact: '孙伟华\n手机：139-0211-4444\n邮箱：sunwh@topre.com\n微信号：sunwh_realty\n公司：鼎盛地产集团',
      tags: JSON.stringify(['商业地产', '总裁', '综合体', '开发']),
      price: 90,
      views: 1543,
      created_at: '2024-02-28 10:00:00',
    },
    {
      title: '新能源上市公司董秘',
      category: 'energy',
      region: '南京',
      intro: 'A股上市新能源公司董事会秘书，深度参与公司IPO及多次再融资项目。精通上市公司信息披露、投资者关系管理和资本运作，与各大券商研究所保持良好沟通。',
      contact: '周文博\n手机：138-0250-2222\n邮箱：zhouwb@newenergy.com\n微信号：zhouwb_ir\n公司：绿能科技股份',
      tags: JSON.stringify(['新能源', '董秘', '上市公司', '资本运作']),
      price: 45,
      views: 987,
      created_at: '2024-02-25 10:00:00',
    },
    {
      title: '头部MCN机构创始人',
      category: 'media',
      region: '杭州',
      intro: '国内头部MCN机构创始人，签约达人超过5000位，全网粉丝总量突破10亿。深耕短视频和直播电商领域，与各大平台保持深度合作关系，年GMV超过50亿。',
      contact: '林小雨\n手机：137-0571-1111\n邮箱：linxy@topmcn.com\n微信号：linxy_mcn\n公司：星辰传媒',
      tags: JSON.stringify(['MCN', '直播', '短视频', '创始人']),
      price: 50,
      views: 3567,
      created_at: '2024-02-20 10:00:00',
    },
    {
      title: '跨境电商集团运营总监',
      category: 'import',
      region: '深圳',
      intro: '大型跨境电商集团运营总监，负责公司在东南亚和欧美市场的整体运营。管理超过200人的运营团队，精通亚马逊、Shopee等平台运营策略，年销售额突破20亿。',
      contact: '黄小龙\n手机：136-0755-8888\n邮箱：huangxl@crossborder.com\n微信号：huangxl_ec\n公司：通达环球电商',
      tags: JSON.stringify(['跨境电商', '运营', '亚马逊', '东南亚']),
      price: 45,
      views: 1876,
      created_at: '2024-02-18 10:00:00',
    },
    {
      title: '知名券商研究所所长',
      category: 'finance',
      region: '上海',
      intro: '国内Top5券商研究所所长，新财富最佳分析师多次上榜。带领百人研究团队，覆盖全行业研究，在资本市场拥有极强的话语号和影响力，与众多基金经理保持密切交流。',
      contact: '马志强\n手机：139-0210-6666\n邮箱：mazq@topsec.com\n微信号：mazq_research\n公司：鼎信证券研究所',
      tags: JSON.stringify(['券商', '研究所', '分析师', '资本市场']),
      price: 75,
      views: 2345,
      created_at: '2024-02-15 10:00:00',
    },
    {
      title: '人工智能独角兽CTO',
      category: 'tech',
      region: '北京',
      intro: '人工智能独角兽企业联合创始人兼CTO，博士毕业于清华大学计算机系。在大模型、计算机视觉等领域拥有多项核心专利，团队研发的AI产品已服务超过万家企业客户。',
      contact: '吴天宇\n手机：138-0100-3333\n邮箱：wuty@aiunicorn.com\n微信号：wuty_ai_cto\n公司：智源科技',
      tags: JSON.stringify(['AI', 'CTO', '大模型', '独角兽']),
      price: 65,
      views: 3890,
      created_at: '2024-02-12 10:00:00',
    },
  ];

  const insertResources = db.transaction(() => {
    for (const r of resources) {
      insertResource.run(r.title, r.category, r.region, r.intro, r.contact, r.tags, r.price, r.views, r.created_at);
    }
  });
  insertResources();

  console.log(`填充完成：${categories.length} 个分类，${plans.length} 个套餐，${resources.length} 条资源。`);
}

// 如果直接运行此文件则执行填充后退出
if (require.main === module) {
  seed();
  process.exit(0);
}

// 导出供 server/index.js 调用
module.exports = seed;
