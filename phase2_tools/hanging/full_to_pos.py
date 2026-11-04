import json, sys
tj = json.load(open(sys.argv[1])); out = {}
for (n, i), m in zip(tj['src'], tj['mapping']): out.setdefault(n, {})[i] = tj['final'][m]
json.dump({n: [d[i] for i in range(len(d))] for n, d in out.items()}, open(sys.argv[2], 'w'))
