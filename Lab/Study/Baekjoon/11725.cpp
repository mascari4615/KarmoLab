#define _CRT_SECURE_NO_WARNINGS
#include <iostream>

using namespace std;

struct Node
{
	int data;
	Node* parent;
};

int main()
{
	int n;
	cin >> n;
	
	Node* nodes = (Node*) malloc(sizeof(Node) * n);

	for (int i = 0; i < n; i++)
	{
		nodes[i].data = i + 1;
		nodes[i].parent = nullptr;
	}

	for (int i = 0; i < n - 1; i++)
	{
		int node1Data;
		int node2Data;

		scanf("%d %d", &node1Data, &node2Data);

		node1Data--;
		node2Data--;

		if (node1Data != 0 && nodes[node1Data].parent == nullptr)
		{
			nodes[node1Data].parent = &nodes[node2Data];
		}
		else
		{
			nodes[node2Data].parent = &nodes[node1Data];
		}
	}

	for (int i = 1; i < n; i++)
	{
		printf("%d\n", nodes[i].parent->data);
	}

	free(nodes);
	return 0;
}