import { doWithTimeout } from "./actions/base";
import { login } from "./actions/login";
import { start } from "./actions/start";

const main = async () => {
  const { page } = await start();

  doWithTimeout(login(page));
};

main();
