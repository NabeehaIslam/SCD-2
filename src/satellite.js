const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");
const utils = require("./utils");

const property = ["url", "date", "brightness", "events", "passType", "image", "scoreData", "exist", "score", "id"];
const events = ["rise", "reachAltitude10deg", "highestPoint", "dropBelowAltitude10deg", "set", "exitShadow", "enterShadow"];
const attribute = ["time", "altitude", "azimuth", "distance", "brightness", "sunAltitude"];

const compare = [
	function (a, b) {
		return a[property[6]][1] >= b[property[6]][1] ? 1 : -1;
	},
	function (a, b) {
		return a[property[6]][2] >= b[property[6]][2] ? 1 : -1;
	},
	function (a, b) {
		return a[property[6]][3] <= b[property[6]][3] ? 1 : -1;
	},
	function (a, b) {
		return a[property[7]] <= b[property[7]] ? 1 : -1;
	}
];
const weight = [9.5, 6, 6.5, 6.5];

async function getTable(config) {
	let database = config.database || [];
	let counter = config.counter || 0;
	const opt = config.opt || 0;
	const basedir = `${config.root}satellite${config.target}/`;
	let options;

	if (counter === 0) {
		options = utils.get_options(`PassSummary.aspx?satid=${config.target}&`);
		if (!fs.existsSync(basedir)) {
			fs.mkdirSync(basedir, { recursive: true });
		}
	} else {
		options = utils.post_options(`PassSummary.aspx?satid=${config.target}&`, opt);
	}

	try {
		const response = await fetch(options.url, { method: options.method || "GET", body: options.body });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const body = await response.text();

		const $ = cheerio.load(body, { decodeEntities: false });
		let next = "__EVENTTARGET=&__EVENTARGUMENT=&__LASTFOCUS=";
		const tbody = $("form").find("table.standardTable tbody");
		const queue = [];

		tbody.find("tr").each((i, o) => {
			queue.push({
				[property[0]]: "https://www.heavens-above.com/" + $(o).find("td").eq(0).find("a").attr("href").replace("type=V", "type=A"),
				[property[1]]: $(o).find("td").eq(0).find("a").text(),
				[property[2]]: $(o).find("td").eq(1).text(),
				[property[3]]: {},
				[property[4]]: $(o).find("td").eq(11).text()
			});
		});

		async function factory(temp) {
			try {
				const res = await fetch(utils.image_options(temp[property[0]]).url);
				if (!res.ok) throw new Error("Bad response");
				const html = await res.text();
				console.log("Success", temp);

				const $ = cheerio.load(html, { decodeEntities: false });
				const table = $("form").find("table.standardTable");
				const tbody = table.find("tbody");
				let shift = 0;
				let flag = false;
				const data = [];

				for (let i = 0; i < tbody.find("tr").length; i++) {
					let current;
					const row = tbody.find("tr").eq(i);
					const firstCell = row.find("td").eq(0).text();

					if (firstCell === "离开地影") {
						temp[property[3]][events[5]] = {};
						current = temp[property[3]][events[5]];
						shift++;
					} else if (firstCell === "进入地影") {
						temp[property[3]][events[6]] = {};
						current = temp[property[3]][events[6]];
						shift++;
					} else {
						temp[property[3]][events[i - shift]] = {};
						current = temp[property[3]][events[i - shift]];
					}

					for (let j = 0; j < 6; j++) {
						current[attribute[j]] = row.find("td").eq(j + 1).text();
					}

					if (i - shift === 2 && !flag) {
						flag = true;
						data[0] = parseInt(current[attribute[0]].split(":")[0]);
						data[1] = parseFloat(current[attribute[4]]);
						data[2] = parseFloat(current[attribute[5]].split("°")[0]);
						data[3] = parseInt(current[attribute[1]].split("°")[0]);
					}
				}

				const startTime = utils.getTimestamp(temp[property[3]][events[5]] ? temp[property[3]][events[5]][attribute[0]] : temp[property[3]][events[1]][attribute[0]]);
				const endTime = utils.getTimestamp(temp[property[3]][events[6]] ? temp[property[3]][events[6]][attribute[0]] : temp[property[3]][events[3]][attribute[0]]);
				temp[property[5]] = "https://www.heavens-above.com/" + $("#ctl00_cph1_imgViewFinder").attr("src");
				temp[property[6]] = data;
				temp[property[7]] = endTime - startTime;
				temp[property[8]] = 0;
				const id = utils.md5(Math.random().toString());
				temp[property[9]] = id;

				fs.writeFileSync(basedir + id + ".html", table.html());
				const imgUrl = utils.image_options(temp[property[5]]).url;
				const imgRes = await fetch(imgUrl);
				const buffer = await imgRes.arrayBuffer();
				fs.writeFileSync(basedir + id + ".png", Buffer.from(buffer));
				return temp;
			} catch (err) {
				console.error("Factory error:", err);
				return null;
			}
		}

		const results = await Promise.all(queue.map(factory));
		const fulfilled = results.filter(Boolean);
		database = database.concat(fulfilled);

		$("form").find("input").each((i, o) => {
			if ($(o).attr("name") === "ctl00$cph1$btnPrev" || $(o).attr("name") === "ctl00$cph1$visible") return;
			else next += `&${$(o).attr("name")}=${$(o).attr("value")}`;
		});

		next += "&ctl00$cph1$visible=radioVisible";
		next = next.replace(/\+/g, "%2B").replace(/\//g, "%2F");

		if (counter++ < config.pages) {
			getTable({ target: config.target, pages: config.pages, root: config.root, counter, opt: next, database });
		} else {
			for (let i = 0; i < 4; i++) {
				database.sort(compare[i]);
				database = database.map((ele, index) => {
					ele[property[8]] += 100 * (1 - index / database.length) * weight[i];
					return ele;
				});
			}
			database = database.map((ele) => {
				if (isNaN(ele[property[6]][1])) {
					ele[property[8]] = 0;
					return ele;
				}
				if (ele[property[6]][0] >= 17 && ele[property[6]][0] <= 19) ele[property[8]] += 850;
				else if (ele[property[6]][0] >= 20 && ele[property[6]][0] <= 23) ele[property[8]] += 950;
				else if (ele[property[6]][0] >= 0 && ele[property[6]][0] <= 3) ele[property[8]] += 400;
				else if (ele[property[6]][0] >= 4 && ele[property[6]][0] <= 6) ele[property[8]] += 300;
				ele[property[8]] = Math.floor(ele[property[8]] / 40);
				return ele;
			});
			database.sort((a, b) => (a[property[8]] <= b[property[8]] ? 1 : -1));
			fs.writeFileSync(basedir + "index.json", JSON.stringify(database, null, 2));
		}
	} catch (err) {
		console.error("Fetch failed:", err);
	}
}

exports.getTable = getTable;
