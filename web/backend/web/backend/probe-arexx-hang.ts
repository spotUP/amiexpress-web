import { AREXXInterpreter } from './src/services/arexx.service';

const script = `
Open('UserData','RAM:nonexistent-userdata-test','R')
Seek('UserData',-148,'E')
NrUsers = 0
Do Until NrUsers > 0
 NrUsers = C2D(ReadCH('UserData',2))
 Seek('UserData',-234,'C')
end
say 'DONE, NrUsers=' NrUsers
`;

const ctx: any = { output: [], session: {}, user: {} };
const interp = new AREXXInterpreter(ctx, []);

const t0 = Date.now();
const timer = setInterval(() => {
  console.log(`[probe] still running after ${Date.now() - t0}ms`);
  if (Date.now() - t0 > 4000) {
    console.log('[probe] CONFIRMED HANG - killing probe process');
    process.exit(1);
  }
}, 500);
timer.unref();

interp.execute(script).then((result) => {
  console.log('[probe] completed:', result);
  process.exit(0);
});
