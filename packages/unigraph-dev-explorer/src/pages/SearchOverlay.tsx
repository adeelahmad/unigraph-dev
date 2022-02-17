import { Card, InputBase, Typography } from '@mui/material';
import _ from 'lodash';
import React from 'react';
import { AppState } from 'unigraph-dev-common/lib/types/unigraph';
import { buildUnigraphEntity } from 'unigraph-dev-common/lib/utils/entityUtils';
import { buildGraph, UnigraphObject } from 'unigraph-dev-common/lib/utils/utils';
import { AutoDynamicView } from '../components/ObjectView/AutoDynamicView';
import { inlineTextSearch } from '../components/UnigraphCore/InlineSearchPopup';
import { parseQuery } from '../components/UnigraphCore/UnigraphSearch';
import { isElectron, typeHasDynamicView } from '../utils';

const groups = [
    {
        title: 'Add an item',
        key: 'adder',
    },
    {
        title: 'Commands',
        key: undefined,
    },
];

function AdderComponent({ input, setInput, open, setClose, callback, summonerTooltip }: any) {
    const parsedKey = input.substr(1, input.indexOf(' ') - 1);
    const parsedValue = input.substr(input.indexOf(' ') + 1);
    const [toAdd, setToAdd] = React.useState<any>(null);
    const [adderRefs, setAdderRefs] = React.useState<any[]>([]);
    const tf = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        tf.current?.focus();
    }, [open]);

    React.useEffect(() => {
        const allAdders = window.unigraph.getState('registry/quickAdder').value;
        if (allAdders[parsedKey]) {
            allAdders[parsedKey].adder(parsedValue).then((res: any) => {
                const [object, type] = res;
                window.unigraph.getSchemas().then((schemas: any) => {
                    try {
                        const padded = buildUnigraphEntity(JSON.parse(JSON.stringify(object)), type, schemas);
                        setToAdd(
                            <div
                                onClickCapture={(ev) => {
                                    ev.stopPropagation();
                                }}
                            >
                                <AutoDynamicView
                                    object={new UnigraphObject(padded)}
                                    options={{ noDrag: true, noDrop: true, noClickthrough: true }}
                                    style={{
                                        border: 'gray',
                                        borderStyle: 'dashed',
                                        borderWidth: 'thin',
                                        margin: '2px',
                                        borderRadius: '8px',
                                        padding: '4px',
                                    }}
                                />
                            </div>,
                        );
                    } catch (e) {
                        console.log(e);
                    }
                });
            });
        }
    }, [input]);

    return (
        <div>
            <InputBase
                style={{ width: '100%' }}
                inputRef={tf}
                value={input}
                onChange={(ev) => {
                    const newContent = ev.target.value;
                    const caret = ev.target.selectionStart || 0;
                    const hasMatch = inlineTextSearch(
                        ev.target.value,
                        tf,
                        caret,
                        async (match: any, newName: string, newUid: string) => {
                            const newStr = `${newContent?.slice?.(0, match.index)}[[${newName}]]${newContent?.slice?.(
                                match.index + match[0].length,
                            )}`;
                            setInput(newStr);
                            setAdderRefs([...adderRefs, { key: newName, value: newUid }]);
                            window.unigraph.getState('global/searchPopup').setValue({ show: false });
                        },
                    );
                    if (!hasMatch) window.unigraph.getState('global/searchPopup').setValue({ show: false });
                    setInput(ev.target.value);
                }}
                onKeyPress={async (ev) => {
                    if (ev.key === 'Enter' && window.unigraph.getState('registry/quickAdder').value[parsedKey]) {
                        window.unigraph
                            .getState('registry/quickAdder')
                            .value[parsedKey]?.adder(
                                JSON.parse(JSON.stringify(parsedValue)),
                                false,
                                callback,
                                adderRefs,
                            )
                            .then((uids: any[]) => {
                                if (callback && uids[0]) callback(uids[0]);
                                return uids;
                            })
                            .then((uids: any[]) => {
                                // TODO this callback should be abstracted into a registered hook for the adder
                                // TODO get these keys some other way bc they might change
                                const keysToInbox = ['bookmark', 'bm', 'todo', 'td', 'note', 'n'];
                                if (keysToInbox.includes(parsedKey)) {
                                    window.unigraph.runExecutable(
                                        '$/executable/add-item-to-list',
                                        {
                                            where: '$/entity/inbox',
                                            item: uids,
                                        },
                                        undefined,
                                        undefined,
                                        true,
                                    );
                                }
                            });
                        setInput('');
                        setClose();
                    }
                }}
            />
            <div>
                {summonerTooltip ? <Typography>{summonerTooltip}</Typography> : []}
                <Typography>{`Adding ${parsedKey} (Enter to add)`}</Typography>
                {toAdd || []}
                <div style={{ marginTop: '32px' }}>
                    {window.unigraph.getState('registry/quickAdder').value[parsedKey]?.tooltip
                        ? React.createElement(window.unigraph.getState('registry/quickAdder').value[parsedKey]?.tooltip)
                        : []}
                </div>
            </div>
        </div>
    );
}

export function SearchOverlay({ open, setClose, callback, summonerTooltip, defaultValue }: any) {
    const [input, setInput] = React.useState(defaultValue || '');
    const [parsed, setParsed] = React.useState<any>({});

    const [entries, setEntries] = React.useState<any[]>([]);

    const [entities, setEntities] = React.useState<any[]>([]);
    const [commands, setCommands] = React.useState<any[]>([]);
    const [finalCommands, setFinalCommands] = React.useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = React.useState(0);

    const tf = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        setCommands(window.unigraph.getState('registry/commands').value);
    }, []);

    React.useEffect(() => {
        tf.current?.focus();
    }, [open]);

    React.useEffect(() => {
        if (typeof defaultValue === 'string') setInput(defaultValue);
    }, defaultValue);

    React.useEffect(() => {
        if (parsed.type === 'command' && input === '') {
            setCommands(window.unigraph.getState('registry/commands').value);
        }
        setParsed({
            type: input === '' ? '' : 'command',
            value: input,
        });
        setEntries([]);
        setEntities([]);

        setSelectedIndex(0);
    }, [input]);

    React.useEffect(() => {
        const displayCommands = groups
            .filter((grp: any) => commands.filter((el: any) => el.group === grp.key).length > 0)
            .map((grp: any) => [
                {
                    type: 'group',
                    element: <Typography style={{ color: 'gray' }}>{grp.title}</Typography>,
                },
                ...commands
                    .filter((el) => el.group === grp.key)
                    .map((el: any) => ({
                        type: 'command',
                        element: (
                            <div
                                onClick={(ev) => {
                                    el.onClick(ev, setInput, setClose);
                                }}
                                style={{
                                    cursor: 'pointer',
                                    display: 'flex',
                                }}
                            >
                                <Typography style={{ flexGrow: 1 }}>{el.name}</Typography>
                                <Typography style={{ color: 'gray' }}>{el.about}</Typography>
                            </div>
                        ),
                        dontClose: el.dontClose,
                    })),
            ])
            .flat();
        displayCommands.push(
            { type: 'group', element: <Typography style={{ color: 'gray' }}>Search results</Typography> },
            ...(entities[0] === null
                ? [
                      {
                          type: 'command',
                          element: <Typography>No results</Typography>,
                      },
                  ]
                : buildGraph(entities as any[])
                      .slice(0, 20)
                      .map((datael: any) => ({
                          type: 'command',
                          element: (
                              <AutoDynamicView
                                  object={datael}
                                  options={{ noClickthrough: false }}
                                  style={{
                                      cursor: 'pointer',
                                      display: 'flex',
                                  }}
                              />
                          ),
                      }))),
        );
        displayCommands
            .filter((el) => el.type === 'command')
            .forEach((el, index) => {
                Object.assign(el, { index });
            });
        setFinalCommands(displayCommands);
    }, [commands, entities]);

    React.useEffect(() => {
        if (parsed?.type === 'command') {
            // list all commands
            const commandsVal = window.unigraph.getState('registry/commands').value;
            setCommands(
                commandsVal.filter(
                    (el: any) => (el.name as string).toLowerCase().includes(parsed.value.toLowerCase()) !== false,
                ),
            );
        }
    }, [parsed]);

    const search = React.useMemo(
        () =>
            _.debounce((newQuery) => {
                if (newQuery.length) {
                    window.unigraph
                        .getSearchResults(parseQuery(newQuery) as any, 'metadata', 2, {
                            noPrimitives: true,
                        })
                        .then((res) => {
                            setEntities(
                                res.entities?.length > 0
                                    ? res.entities.filter(
                                          (el) =>
                                              typeHasDynamicView(el?.type?.['unigraph.id']) &&
                                              !['$/schema/markdown', '$/schema/subentity'].includes(
                                                  el?.type?.['unigraph.id'],
                                              ),
                                      )
                                    : [null],
                            );
                        });
                } else {
                    setEntities([]);
                }
            }, 200),
        [],
    );

    React.useEffect(() => {
        search(input);
    }, [input]);

    const defaultEl = (
        <div>
            <InputBase
                inputRef={tf}
                autoFocus
                style={{ width: '100%' }}
                value={input}
                onChange={(ev) => {
                    setInput(ev.target.value);
                }}
                onKeyDown={(ev) => {
                    if (ev.key === 'ArrowDown') {
                        if (selectedIndex < finalCommands.filter((el: any) => el.type === 'command').length - 1)
                            setSelectedIndex((idx) => idx + 1);
                    } else if (ev.key === 'ArrowUp') {
                        if (selectedIndex > 0) setSelectedIndex((idx) => idx - 1);
                    } else if (ev.key === 'Enter') {
                        (document.getElementById('omnibarItem_current')?.children[0] as any)?.click();
                    } else return;
                    ev.preventDefault();
                    ev.stopPropagation();
                }}
                placeholder="Enter: +<type shortname> to create; ?<search query> to search; <command> to execute command"
            />
            <div>
                {summonerTooltip ? <Typography>{summonerTooltip}</Typography> : []}
                {entries}
                {parsed?.type === 'command' || parsed?.type === ''
                    ? finalCommands.map((el) => (
                          <div
                              style={{
                                  backgroundColor: el.index === selectedIndex ? 'whitesmoke' : '',
                                  padding: '4px',
                                  borderRadius: '8px',
                              }}
                              id={`omnibarItem_${el.index === selectedIndex ? 'current' : ''}`}
                              onClickCapture={(ev: any) => {
                                  if (!el.dontClose) {
                                      setTimeout(() => {
                                          setClose(true);
                                      }, 100);
                                  }
                              }}
                          >
                              {el.element}
                          </div>
                      ))
                    : []}
                <div />
            </div>
        </div>
    );
    // console.log(window.unigraph.getState('registry/quickAdder').value[input.substr(1, input.indexOf(' ') - 1)]);
    return input.startsWith?.('+') &&
        window.unigraph.getState('registry/quickAdder').value[input.substr(1, input.indexOf(' ') - 1)] ? (
        <AdderComponent
            input={input}
            setInput={setInput}
            open={open}
            setClose={setClose}
            callback={callback}
            summonerTooltip={summonerTooltip}
        />
    ) : (
        defaultEl
    );
}

type OmnibarSummonerType = {
    show: boolean;
    tooltip: string;
    callback: any;
    defaultValue: string;
};

export function SearchOverlayPopover({ open, setClose, noShadow }: any) {
    const [searchEnabled, setSearchEnabled] = React.useState(false);
    const [summonerState, setSummonerState] = React.useState<Partial<OmnibarSummonerType>>({});
    const overlay = React.useRef(null);
    // console.log(open, searchEnabled);

    const omnibarSummoner: AppState<Partial<OmnibarSummonerType>> = window.unigraph.getState('global/omnibarSummoner');

    React.useEffect(() => {
        setSearchEnabled(open);
    }, [open]);

    React.useEffect(() => {
        (window as any).showOmnibar = () => {
            setSearchEnabled(true);
        };
        omnibarSummoner.subscribe((v) => {
            setSummonerState(v);
        });
    }, []);

    React.useEffect(() => {
        if (summonerState?.show) setSearchEnabled(true);
        else setSearchEnabled(false);
    }, [summonerState]);

    React.useEffect(() => {
        if (searchEnabled) {
            const listener = (event: MouseEvent) => {
                const withinBoundaries = overlay && event.composedPath().includes((overlay as any).current);

                if (!withinBoundaries) {
                    setSearchEnabled(false);
                    document.removeEventListener('click', listener);
                }
            };
            document.addEventListener('click', listener);
        } else {
            if (omnibarSummoner.value?.show) {
                omnibarSummoner.setValue({});
            }
            if (setClose) setClose();
        }
        document.onkeydown = function (evt) {
            evt = evt || window.event;
            if ((evt.ctrlKey || evt.metaKey) && evt.key === 'e' && !isElectron()) {
                evt.preventDefault();
                if (open === undefined) setSearchEnabled(!searchEnabled);
            }
            if (searchEnabled && evt.key === 'Escape') {
                setSearchEnabled(false);
            }
        };
    }, [searchEnabled]);

    return (
        <Card
            elevation={noShadow ? 0 : 12}
            ref={overlay}
            style={{
                zIndex: 99,
                position: 'absolute',
                width: 'calc(100% - 128px)',
                maxWidth: '800px',
                left: 'max(64px, 50% - 400px)',
                top: '64px',
                maxHeight: '60%',
                overflow: 'auto',
                padding: '16px',
                borderRadius: '16px',
                display: searchEnabled ? 'block' : 'none',
            }}
        >
            {searchEnabled ? (
                <SearchOverlay
                    open={searchEnabled}
                    callback={summonerState.callback}
                    summonerTooltip={summonerState.tooltip}
                    defaultValue={summonerState.defaultValue}
                    setClose={() => {
                        setSearchEnabled(false);
                    }}
                />
            ) : (
                []
            )}
        </Card>
    );
}
