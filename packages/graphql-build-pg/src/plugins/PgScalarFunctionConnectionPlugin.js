const {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLString,
} = require("graphql");

const base64 = str => Buffer.from(String(str)).toString("base64");

module.exports = function PgTablesPlugin(
  builder,
  { pgInflection: inflection }
) {
  builder.hook(
    "init",
    (
      _,
      {
        buildObjectWithHooks,
        pgIntrospectionResultsByKind: introspectionResultsByKind,
        getTypeByName,
        pgGqlTypeByTypeId: gqlTypeByTypeId,
      }
    ) => {
      const Cursor = getTypeByName("Cursor");
      introspectionResultsByKind.procedure
        .filter(proc => proc.returnsSet)
        .forEach(proc => {
          const returnType =
            introspectionResultsByKind.typeById[proc.returnTypeId];
          const returnTypeTable =
            introspectionResultsByKind.classById[returnType.classId];
          if (returnTypeTable) {
            // Just use the standard table connection from PgTablesPlugin
            return;
          }
          const NodeType = gqlTypeByTypeId[returnType.id] || GraphQLString;
          const EdgeType = buildObjectWithHooks(
            GraphQLObjectType,
            {
              name: inflection.scalarFunctionEdge(
                proc.name,
                proc.namespace.name
              ),
              fields: () => {
                return {
                  cursor: {
                    type: Cursor,
                    resolve(data) {
                      return base64(JSON.stringify(data.__cursor));
                    },
                  },
                  node: {
                    type: NodeType,
                    resolve(data) {
                      return data.value;
                    },
                  },
                };
              },
            },
            {
              isEdgeType: true,
              nodeType: NodeType,
              pgIntrospection: proc,
            }
          );
          /*const ConnectionType = */
          buildObjectWithHooks(
            GraphQLObjectType,
            {
              name: inflection.scalarFunctionConnection(
                proc.name,
                proc.namespace.name
              ),
              description: `A connection to a list of \`${NodeType.name}\` values.`,
              fields: ({ recurseDataGeneratorsForField }) => {
                recurseDataGeneratorsForField("edges");
                recurseDataGeneratorsForField("nodes");
                return {
                  nodes: {
                    description: `A list of \`${NodeType.name}\` objects.`,
                    type: new GraphQLNonNull(new GraphQLList(NodeType)),
                    resolve(data) {
                      return data.data.map(entry => entry.value);
                    },
                  },
                  edges: {
                    description: `A list of edges which contains the \`${NodeType.name}\` and cursor to aid in pagination.`,
                    type: new GraphQLNonNull(
                      new GraphQLList(new GraphQLNonNull(EdgeType))
                    ),
                    resolve(data) {
                      return data.data;
                    },
                  },
                };
              },
            },
            {
              isConnectionType: true,
              edgeType: EdgeType,
              nodeType: NodeType,
              pgIntrospection: proc,
            }
          );
        });
      return _;
    }
  );
};