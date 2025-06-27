import { login } from "./actions/login";
import { start } from "./actions/start";

const main = async () => {
  const { page } = await start();

  await login(page);
};

main();
