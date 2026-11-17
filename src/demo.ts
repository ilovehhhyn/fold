// Starts the demo page: mounts the fortune teller, or shows one fixed pose for `?pose=tipX,tipZ`.

import "./demo.css";

import { parseFixedPose } from "./fixed-pose";
import { mountFortuneTeller } from "./index";

const containerId = "fortune-teller";

function startDemo(): void {
	const container = document.getElementById(containerId);
	if (container === null) {
		throw new Error(`the demo page must contain an element with id ${containerId}`);
	}
	try {
		const fixedPose = parseFixedPose(window.location.search);
		mountFortuneTeller(container, fixedPose === null ? {} : { fixedPose });
	} catch (error: unknown) {
		if (!(error instanceof RangeError)) {
			throw error;
		}
		const problem = document.createElement("p");
		problem.className = "demo__problem";
		problem.setAttribute("role", "alert");
		problem.textContent = `This page cannot show that pose: ${error.message}`;
		container.append(problem);
	}
}

startDemo();
