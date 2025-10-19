const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");
const utils = require("./utils");

const eventsIridium = ["brightness", "altitude", "azimuth", "satellite", "distanceToFlareCentre", "brightnessAtFlareCentre", "date", "time", "distanceToSatellite", "AngleOffFlareCentre-line", "flareProducingAntenna", "sunAltitude", "angularSeparationFromSun", "image", "id"];

async function getTable(config) {
	let database = config.database || [];
	let counter = config.counter || 0;
	const opt = config.opt || 0;
	const basedir = config.root + "IridiumFlares/";
	let options;

	if (counter === 0) {
		options = utils.get_options("IridiumFlares.aspx?");
		if (!fs.existsSync(basedir)) {
			fs.mkdirSync(basedir, { recursive: true });
		}
	} else {
		options = utils.post_options("IridiumFlares.aspx?", opt);
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
			const temp = {};
			for (let j = 0; j < 6; j++) temp[eventsIridium[j]] = $(o).find("td").eq(j + 1).text();
			temp["url"] = "https://www.heavens-above.com/" + $(o).find("td").eq(0).find("a").attr("href").replace("type=V", "type=A");
			queue.push(temp);
		});

		async function factory(temp) {
			try {
				const res = await fetch(utils.iridium_options(temp["url"]).url);
				if (!res.ok) throw new Error("Bad response");
				const html = await res.text();

				const $ = cheerio.load(html, { decodeEntities: false });
				const table = $("form").find("table.standardTable");
				const tr = table.find("tbody tr");

				[
					[6, 0],
					[7, 1],
					[8, 6],
					[9, 7],
					[10, 9],
					[11, 10],
					[12, 11]
				].forEach(([index, row]) => {
					temp[eventsIridium[index]] = tr.eq(row).find("td").eq(1).text();
				});

				temp[eventsIridium[13]] = "https://www.heavens-above.com/" + $("#ctl00_cph1_imgSkyChart").attr("src");
				const id = utils.md5(Math.random().toString());
				temp[eventsIridium[14]] = id;

				fs.writeFileSync(basedir + id + ".html", table.html());
				const imgUrl = utils.image_options(temp[eventsIridium[13]]).url;
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
			getTable({ count: config.count, pages: config.pages, root: config.root, counter, opt: next, database });
		} else {
			fs.writeFileSync(basedir + "index.json", JSON.stringify(database, null, 2));
		}
	} catch (err) {
		console.error("Fetch failed:", err);
	}
}

exports.getTable = getTable;
