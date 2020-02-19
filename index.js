const fs = require('fs')
const axios = require('axios')
const mkdirp = require('mkdirp')
const PromisePool = require('async-promise-pool')
const createGraph = require('ngraph.graph')

const base = 'https://crates.io'
const url = {
  crates: `/api/v1/crates`,
  crate: name => `/api/v1/crates/${name}`,
  deps: (name, version) => `/api/v1/crates/${name}/${version}/dependencies`
}

;(async function() {
  let graph = createGraph()
  let nextUrl = url.crates + '?page=1&per_page=100&sort=alpha'

  while (nextUrl) {
    const res = await axios.get(base + nextUrl)
    const { crates, meta } = res.data
    nextUrl = meta.next_page ? url.crates + meta.next_page : null

    const pool = new PromisePool({ concurrency: 10 })

    for (let i = 0; i < crates.length; i++) {
      pool.add(async () => {
        const [name, deps] = await getDependencies(crates[i])
        graph.addNode(name, crates[i])
        deps.forEach(dep => {
          graph.addLink(name, dep)
        })
      })
    }

    await pool.all()
    console.log('next', nextUrl)
  }

  // https://github.com/phiresky/crawl-arch/blob/master/layout.js
  console.log(
    'Loaded graph with ' +
      graph.getLinksCount() +
      ' edges; ' +
      graph.getNodesCount() +
      ' nodes'
  )

  const layout = require('ngraph.offline.layout')(graph)

  console.log('Starting layout')
  layout.run()

  const save = require('ngraph.tobinary')
  save(graph, {
    outDir: './data'
  })

  console.log('Done.')
  console.log(
    'Copy `links.bin`, `labels.bin` and `positions.bin` into vis folder'
  )
})()

async function getDependencies(crate) {
  const crateRes = await axios.get(base + url.crate(crate.name))
  const { versions } = crateRes.data

  const depsRes = await axios.get(base + versions[0].links.dependencies)
  return [crate.name, depsRes.data.dependencies.map(dep => dep.crate_id)]
}
