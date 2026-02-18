# 地区代码参考表

每个地区 JSON 文件中填写 `mapCode` 字段，用于地图点亮。

- 海外国家：填国家代码（2位字母）
- 中国省份：填 `CN-` 加省份编号

---

## 海外国家代码

| 中文名 | English | mapCode |
|--------|---------|---------|
| 中国 | China | CN |
| 日本 | Japan | JP |
| 韩国 | South Korea | KR |
| 新加坡 | Singapore | SG |
| 美国 | United States | US |
| 英国 | United Kingdom | GB |
| 法国 | France | FR |
| 德国 | Germany | DE |
| 意大利 | Italy | IT |
| 西班牙 | Spain | ES |
| 葡萄牙 | Portugal | PT |
| 荷兰 | Netherlands | NL |
| 瑞士 | Switzerland | CH |
| 奥地利 | Austria | AT |
| 希腊 | Greece | GR |
| 土耳其 | Turkey | TR |
| 俄罗斯 | Russia | RU |
| 泰国 | Thailand | TH |
| 越南 | Vietnam | VN |
| 马来西亚 | Malaysia | MY |
| 印度尼西亚 | Indonesia | ID |
| 菲律宾 | Philippines | PH |
| 印度 | India | IN |
| 尼泊尔 | Nepal | NP |
| 澳大利亚 | Australia | AU |
| 新西兰 | New Zealand | NZ |
| 加拿大 | Canada | CA |
| 墨西哥 | Mexico | MX |
| 巴西 | Brazil | BR |
| 阿根廷 | Argentina | AR |
| 南非 | South Africa | ZA |
| 埃及 | Egypt | EG |
| 摩洛哥 | Morocco | MA |
| 冰岛 | Iceland | IS |
| 挪威 | Norway | NO |
| 瑞典 | Sweden | SE |
| 芬兰 | Finland | FI |
| 丹麦 | Denmark | DK |

> 完整列表参考 [ISO 3166-1](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2)

---

## 中国省份代码

| 中文名 | English | mapCode |
|--------|---------|---------|
| 北京 | Beijing | CN-11 |
| 天津 | Tianjin | CN-12 |
| 河北 | Hebei | CN-13 |
| 山西 | Shanxi | CN-14 |
| 内蒙古 | Inner Mongolia | CN-15 |
| 辽宁 | Liaoning | CN-21 |
| 吉林 | Jilin | CN-22 |
| 黑龙江 | Heilongjiang | CN-23 |
| 上海 | Shanghai | CN-31 |
| 江苏 | Jiangsu | CN-32 |
| 浙江 | Zhejiang | CN-33 |
| 安徽 | Anhui | CN-34 |
| 福建 | Fujian | CN-35 |
| 江西 | Jiangxi | CN-36 |
| 山东 | Shandong | CN-37 |
| 河南 | Henan | CN-41 |
| 湖北 | Hubei | CN-42 |
| 湖南 | Hunan | CN-43 |
| 广东 | Guangdong | CN-44 |
| 广西 | Guangxi | CN-45 |
| 海南 | Hainan | CN-46 |
| 重庆 | Chongqing | CN-50 |
| 四川 | Sichuan | CN-51 |
| 贵州 | Guizhou | CN-52 |
| 云南 | Yunnan | CN-53 |
| 西藏 | Tibet | CN-54 |
| 陕西 | Shaanxi | CN-61 |
| 甘肃 | Gansu | CN-62 |
| 青海 | Qinghai | CN-63 |
| 宁夏 | Ningxia | CN-64 |
| 新疆 | Xinjiang | CN-65 |
| 香港 | Hong Kong | CN-HK |
| 澳门 | Macao | CN-MO |
| 台湾 | Taiwan | CN-TW |

---

## 示例

```json
// 海外国家
{
  "id": "korea",
  "mapCode": "KR"
}

// 中国省份
{
  "id": "sichuan",
  "mapCode": "CN-51"
}
```
