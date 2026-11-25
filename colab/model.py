from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import least_squares
N = 108_000_000          
GAMMA, MU, OMEGA = 1/7, 1/14, 1/365   # pemulihan, kematian nyamuk, hilang imun (per hari)
def simulate(p, days=1826, ctrl=0.0, ctrl_start=None, i0=2e-5):
    b, c, a, t0 = p[:4]
    S, I, R, Iv = 1-i0, i0, 0.0, 1e-4
    out = []
    for d in range(days):
        red = ctrl if (ctrl_start is not None and d >= ctrl_start) else 0.0
        m = (1 + a*np.cos(2*np.pi*(d-t0)/365)) * (1-red)
        new = b*m*Iv*S
        dS = -new + OMEGA*R
        dI = new - GAMMA*I
        dR = GAMMA*I - OMEGA*R
        dIv = c*I*(1-Iv) - MU*Iv
        S += dS; I += dI; R += dR; Iv += dIv
        out.append(new)
    out = np.array(out)
    edges = pd.date_range('2016-01-01', periods=days, freq='D')
    return pd.Series(out*N, index=edges).resample('MS').sum()
def load():
    df = pd.read_csv(Path(__file__).resolve().parent / 'ph_dengue_cases2016-2020.csv')
    df['date'] = pd.to_datetime(df.Month+' '+df.Year.astype(str), format='%B %Y')
    return df.groupby('date').Dengue_Cases.sum()
def fit(obs):
    tr = obs[:'2018-12-01']
    def res(q):
        p = [q[0], q[1], q[2], q[3]]; rho = q[4]
        sim = simulate(p)[:'2018-12-01']*rho
        return (sim.values-tr.values)/np.sqrt(tr.values+1)
    best=None
    for b0 in (0.3,0.6):
        r = least_squares(res,[b0,0.3,0.4,200,0.5],bounds=([0.05,0.05,0,0,0.01],[3,3,0.95,365,1]))
        if best is None or r.cost<best.cost: best=r
    return best.x
if __name__=='__main__':
    obs = load(); q = fit(obs); sim = simulate(q[:4])*q[4]
    f = lambda s,e: (np.sqrt(((sim[s:e]-obs[s:e])**2).mean()), (abs(sim[s:e]-obs[s:e])/obs[s:e]).mean()*100)
    print('params', np.round(q,4).tolist())
    print('train16-18 RMSE,MAPE', f('2016','2018'))
    print('val19', f('2019','2019'))
    print('obs2019', int(obs['2019'].sum()), 'sim2019', int(sim['2019'].sum()))
    print('R0-ish', q[0]*q[1]/(GAMMA*MU))
    for c in (0,.2,.4):
        s = simulate(q[:4],ctrl=c,ctrl_start=1096)*q[4]; print(c, int(s['2019'].sum()))
    print([int(x) for x in obs.values])
    print([int(x) for x in sim.values[:60]])