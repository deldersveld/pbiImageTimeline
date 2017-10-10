/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) David Eldersveld
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    "use strict";

    import DataViewValueColumnGroup = powerbi.DataViewValueColumnGroup;
    import DataRoleHelper = powerbi.extensibility.utils.dataview.DataRoleHelper;
    import tooltip = powerbi.extensibility.utils.tooltip;
    import TooltipEnabledDataPoint = powerbi.extensibility.utils.tooltip.TooltipEnabledDataPoint;
    import TooltipEventArgs = powerbi.extensibility.utils.tooltip.TooltipEventArgs;

    interface TimelineDataPoint {
		category: string;
		sequence: string;
		imageUrl: string;
        measure: number;
		tooltips: VisualTooltipDataItem[];
		selectionId: powerbi.visuals.ISelectionId;
    };

    interface TimelineViewModel {
		timelineDataPoints: TimelineDataPoint[];
    }
    
    function visualTransform(options: VisualUpdateOptions, host: IVisualHost, optionDateDisplay: string, optionHttpsUrlOnly: boolean): any {
		let dataViews = options.dataViews;
        //console.log('visualTransform', dataViews);
		
		let viewModel: TimelineViewModel = {
            timelineDataPoints: []
        };
		
		if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.categories[0].source){
                this.hideAll();
                return viewModel;
        }
		
		let categorical = dataViews[0].categorical;
        let category = categorical.categories[0];
		let dataValue = categorical.values[0];
		let dataValues: DataViewValueColumns = categorical.values;
		let grouped: DataViewValueColumnGroup[] = dataValues.grouped();
		
		let tDataPoints: TimelineDataPoint[] = [];
		
		let categoryIndex = DataRoleHelper.getCategoryIndexOfRole(dataViews[0].categorical.categories, "category");
		let sequenceIndex = DataRoleHelper.getCategoryIndexOfRole(dataViews[0].categorical.categories, "sequence");
		let imageUrlIndex = DataRoleHelper.getCategoryIndexOfRole(dataViews[0].categorical.categories, "imageUrl");
        let measureIndex = DataRoleHelper.getMeasureIndexOfRole(grouped, "measure");

        //console.log(categoryIndex, sequenceIndex, imageUrlIndex, measureIndex);
        
        let metadata = dataViews[0].metadata;
        let categoryColumnName = metadata.columns.filter(c => c.roles["category"])[0].displayName;
        let valueColumnName = metadata.columns.filter(c => c.roles["measure"])[0].displayName;

        let dateFormat = d3.time.format(optionDateDisplay);
        
		for (let i = 0, len = categorical.categories[categoryIndex].values.length; i < len; i++) {
            
            let sequenceDisplay = "";

            //validate date sequence - -1 index value or bad value substitutes new Date()
            let sequenceCheck = new Date().toString();
            if(sequenceIndex >= 0){
                let dateValidation = Date.parse(categorical.categories[sequenceIndex].values[i].toString());
                if (dateValidation.toString() != "NaN"){
                    sequenceCheck = categorical.categories[sequenceIndex].values[i].toString();
                    sequenceDisplay = dateFormat(new Date(categorical.categories[sequenceIndex].values[i].toString()));
                }
            }

            //validate image URL
            let imageCheck = null;
            let validate = false;
            if(imageUrlIndex == -1){
                imageCheck = null;
            }
            else{
                let imageValue = categorical.categories[imageUrlIndex].values[i];
                if(imageValue.toString().slice(0,5) != "http:"){
                    imageCheck = null;
                }
                else if(optionHttpsUrlOnly == true && imageValue.toString().slice(0,6) != "https:"){
                    imageCheck = null;
                }
                else{
                    imageCheck = imageValue.toString();
                }
            }

            //validate measure
            let measureCheck = 1;
            measureIndex == -1 ? measureCheck = 1: measureCheck = parseFloat(categorical.values[measureIndex].values[i].toString());

            //add data
            tDataPoints.push({
                category: categorical.categories[categoryIndex].values[i].toString(),
                sequence:  sequenceCheck,
                imageUrl: imageCheck,
                measure: measureCheck,
                tooltips: [{
                                displayName: categoryColumnName,
                                value: categorical.categories[categoryIndex].values[i].toString(),
                                header: sequenceDisplay
                            },
                            {
                                displayName: valueColumnName,
                                value: measureCheck.toString()
                            }],
                selectionId: host.createSelectionIdBuilder().withCategory(category, i).createSelectionId()
            });
            
        }
		
		return {
            timelineDataPoints: tDataPoints
        };
    }
    
    function validateImageUrl(field){
        
    }

    export class Visual implements IVisual {
        private target: HTMLElement;
        private host: IVisualHost;
        private settings: VisualSettings;
        private container: d3.Selection<any>;
        private svg: d3.Selection<SVGAElement>;
        private main: d3.Selection<SVGAElement>;
        private brushArea: d3.Selection<SVGAElement>;
        private axis: d3.Selection<SVGAElement>;
        private selectionManager: ISelectionManager;

        constructor(options: VisualConstructorOptions) {
            //console.log('Visual constructor', options);
            this.target = options.element;
            this.host = options.host;
            this.selectionManager = options.host.createSelectionManager();

            let container = this.container = d3.select(this.target).append("div")
                .attr("id", "container");

            let svg = this.svg = container
                .append("svg")
                .attr("class", "timeline");

            let mini = this.brushArea = this.svg
                .append("g")
                .attr("class", "mini");

            let main = this.main = this.svg
                .append("g")
                .attr("class", "main");
                
            let axis = this.axis = main.append("g")
                .attr("class", "axis");
            
        }

        public update(options: VisualUpdateOptions) {
            this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
            //console.log('Visual update', options);

            let selectionManager = this.selectionManager;
            let host = this.host;

            let optionColor = this.settings.dataPoint.defaultColor;
            let optionEventColor = this.settings.dataPoint.eventColor;
            let optionDateDisplay = this.settings.dataPoint.dateDisplay;
            let optionMeasureResizesImage = this.settings.dataPoint.measureResizesImage;
            let optionHttpsUrlOnly = this.settings.dataPoint.httpsUrlOnly;

            let margin = [10, 75, 10, 75]; //top right bottom left
            let w = options.viewport.width - margin[1] - margin[3];
            let h = options.viewport.height - margin[0] - margin[2];
            let brushHeight = 35;
            let mainHeight = h - brushHeight - 10;
            let radius = 7;
            let transitionRadius = radius + 5;
            let timelineHeight = 45;

            //ticks
            let tickCount = 10;
            if(options.viewport.width > 700){
                tickCount = options.viewport.width / 125;
            }
            else if(options.viewport.width > 500){
                tickCount = options.viewport.width / 150;
            }
            else if(options.viewport.width > 300){
                tickCount = options.viewport.width / 175;
            }
            else{
                tickCount = options.viewport.width / 200;
            }

            let viewModel: TimelineViewModel = visualTransform(options, this.host, optionDateDisplay, optionHttpsUrlOnly);
            //console.log('ViewModel', viewModel);
            if (!viewModel.timelineDataPoints
                || !viewModel.timelineDataPoints[0].category
                || !viewModel.timelineDataPoints[0].sequence){
                console.log("missing data");
                return;
            }
            
            let sequenceMin = d3.min(viewModel.timelineDataPoints.map(d=>new Date(d.sequence)));
			//console.log("sequenceMin: ", sequenceMin);
			
            let sequenceMax = d3.max(viewModel.timelineDataPoints.map(d=>new Date(d.sequence)));
            //console.log("sequenceMax: ", sequenceMax);

            let measureMin = d3.min(viewModel.timelineDataPoints.map(d=>d.measure));
            //console.log("measureMin: ", measureMin);

            let measureMax = d3.max(viewModel.timelineDataPoints.map(d=>d.measure));
            //console.log("measureMax: ", measureMax);

            this.container
                .attr("height", options.viewport.height)
                .attr("width", options.viewport.width);

            let svg = this.svg
                .attr("viewBox", "0 0 " + options.viewport.width + " " + options.viewport.height + "")
                .attr("height", options.viewport.height)
                .attr("width", options.viewport.width);   

            let x = d3.time.scale()
                .domain([sequenceMin, sequenceMax])
                .range([0, w]);

            let x1 = d3.time.scale()
				.domain([sequenceMin, sequenceMax])
                .range([0, w]);

            let xAxis = d3.svg.axis()
                .scale(x)
                .orient("top")
                .ticks(tickCount)
                .tickSize(10, 0)
                .tickFormat(d3.time.format(optionDateDisplay));
                
            this.axis
				.attr("class", "axis")
                .call(xAxis);

            let imageScale = d3.scale.linear()
                .domain([measureMin, measureMax])
                .range([35, 70]);

            let pointScale = d3.scale.linear()
                .domain([measureMin, measureMax])
                .range([5, 15]);

            let brushArea = this.brushArea;
            brushArea
                .attr("transform", "translate(" + margin[3] + "," + (margin[0]) + ")")
                .attr("width", w)
                .attr("height", brushHeight);

            let main = this.main;
            main
                .attr("transform", "translate(" + margin[3] + "," + (margin[0] + brushHeight) + ")")
                .attr("width", w)
                .attr("height", mainHeight);
            
			d3.select(".brush").remove(); 
            let brush = d3.svg.brush()
                .x(<any>x)
                .extent(<any>[sequenceMin, sequenceMax])
                .on("brush", function(){draw(host)});

            let brushRect = brushArea.append("g")
                .attr("class", "brush")
                .call(brush)
                .selectAll("rect")
                .attr("y", 1)
                .attr("height", brushHeight - 10)
                .style({
                    "fill": optionColor,
                    "fill-opacity": "1"
                });
            brushRect.transition();

            main.selectAll(".events").remove();
            let itemRects = main.append("g")
                .attr("clip-path", "url(#clip)")
                .attr("class", "events");

            draw(host);

            function draw(host) {
                let events;
                let minExtent = new Date(brush.extent()[0]);
                let maxExtent = new Date(brush.extent()[1]);
                let timelineEvents = viewModel.timelineDataPoints.filter(function (d) { return new Date(d.sequence) <= maxExtent && new Date(d.sequence) >= minExtent; });

                brushArea.select(".brush")
                    .call(brush.extent(<any>[new Date(minExtent), new Date(maxExtent)]));

                x1.domain([minExtent, maxExtent]);

                main.selectAll(".timelineLine").remove();
                let timelineLine = itemRects.selectAll(".timelineLine")
                    .data([1]);
            
                timelineLine.enter().append("svg:line")
                    .attr("class", "timelineLine")
                    .attr("x1", x1(sequenceMin))
                    .attr("y1", brushHeight + timelineHeight)
                    .attr("x2", x1(sequenceMax))
                    .attr("y2", brushHeight + timelineHeight);
                
                timelineLine.transition()
                    .attr("x1", x1(sequenceMin))
                    .attr("x2", x1(sequenceMax));

                timelineLine.exit().remove();

                main.selectAll(".point").remove();
                main.selectAll(".custom-image").remove();

                //fallback to points if no image URL specified
                if(timelineEvents[0].imageUrl == null){
                    var timelineEvent = itemRects.selectAll("circle")
                        .data(timelineEvents);
                    timelineEvent.enter().append("circle")
                        .attr("class", "point")
                        .attr("r", function(d) {
                            if(optionMeasureResizesImage == true){
                                return pointScale(d.measure);
                            }
                            else{
                                return transitionRadius;
                            }
                        })
                        .attr("cx", function(d){return x1(new Date(d.sequence));})
                        .attr("cy", brushHeight + timelineHeight)
                        .style("fill", optionEventColor);
                    timelineEvent.transition()
                        .attr("r", function(d) {
                            if(optionMeasureResizesImage == true){
                                return pointScale(d.measure);
                            }
                            else{
                                return radius;
                            }
                        })
                        .attr("cx", function(d){return x1(new Date(d.sequence));})
                        .attr("cy", brushHeight + timelineHeight)
                        .style("fill", optionEventColor);
                        
                    timelineEvent.exit().remove();
                }
                
                //custom images
                else{
                    var timelineEvent = itemRects.selectAll("image")
                        .data(timelineEvents);

                    timelineEvent.enter().append("svg:image")
                        .attr("class", "custom-image")
                        .attr("x", function(d){return x1(new Date(d.sequence));})
                        .attr("y", brushHeight + timelineHeight)
                        .attr("transform", function(d) {
                            if(optionMeasureResizesImage == true){
                                return "translate(-" + imageScale(d.measure)/2 + ",-" + imageScale(d.measure)/2 + ")";
                            }
                            else{
                                return "translate(-35,-35)"
                            }
                        })
                        .attr("height", function(d) {
                            if(optionMeasureResizesImage == true){
                                return imageScale(d.measure);
                            }
                            else{
                                return 70;
                            }
                        })
                        .attr("width", function(d) {
                            if(optionMeasureResizesImage == true){
                                return imageScale(d.measure);
                            }
                            else{
                                return 70;
                            }
                        })
                        .attr("xlink:href", function(d) {return d.imageUrl});

                    timelineEvent.transition()
                        .attr("x", function(d){return x1(new Date(d.sequence));})
                        .attr("y", brushHeight + timelineHeight)
                        .attr("transform", function(d) {
                            if(optionMeasureResizesImage == true){
                                return "translate(-" + imageScale(d.measure)/2 + ",-" + imageScale(d.measure)/2 + ")";
                            }
                            else{
                                return "translate(-35,-35)"
                            }
                        })
                        .attr("height", function(d) {
                            if(optionMeasureResizesImage == true){
                                return imageScale(d.measure);
                            }
                            else{
                                return 70;
                            }
                        })
                        .attr("width", function(d) {
                            if(optionMeasureResizesImage == true){
                                return imageScale(d.measure);
                            }
                            else{
                                return 70;
                            }
                        })
                        .attr("xlink:href", function(d) {return d.imageUrl});

                    timelineEvent.exit().remove();
                }

                timelineEvent.on('click', function(d) {
                    selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
                        timelineEvent.attr({
                            'opacity': ids.length > 0 ? 0.2 : 1
                        });
                
                        d3.select(this).attr({
                            'opacity': 1
                        });
                    });
                
                    (<Event>d3.event).stopPropagation();
                });

                timelineEvent.on('mouseover', function(d) {
                    if(timelineEvents[0].imageUrl == null){
                        d3.select(this)
                            .attr("r", transitionRadius);
                    }
                    else{
                        d3.select(this)
                            .attr("transform", "translate(-70,-70)")
                            .attr("height", 140)
                            .attr("width", 140);
                    }

                    let mouse = d3.mouse(svg.node());
                    let x = mouse[0];
                    let y = mouse[1];

                    host.tooltipService.show({
                        dataItems: d.tooltips,
                        identities: [d.selectionId],
                        coordinates: [x, y],
                        isTouchEvent: false
                    });
                });

                timelineEvent.on('mouseout', function(d) {
                    if(timelineEvents[0].imageUrl == null){
                        d3.select(this)
                            .attr("r", function(d) {
                                if(optionMeasureResizesImage == true){
                                    return pointScale(d.measure);
                                }
                                else{
                                    return radius;
                                }
                            });
                    }
                    else{
                        d3.select(this)
                            .attr("transform", function(d) {
                                if(optionMeasureResizesImage == true){
                                    return "translate(-" + imageScale(d.measure)/2 + ",-" + imageScale(d.measure)/2 + ")";
                                }
                                else{
                                    return "translate(-35,-35)"
                                }
                            })
                            .attr("height", function(d) {
                                if(optionMeasureResizesImage == true){
                                    return imageScale(d.measure);
                                }
                                else{
                                    return 70;
                                }
                            })
                            .attr("width", function(d) {
                                if(optionMeasureResizesImage == true){
                                    return imageScale(d.measure);
                                }
                                else{
                                    return 70;
                                }
                            });
                    }

                    host.tooltipService.hide({
                        immediately: true,
                        isTouchEvent: false
                    });
                });

                timelineEvent.on("mousemove", (d) => {
                    let mouse = d3.mouse(svg.node());
                    let x = mouse[0];
                    let y = mouse[1];

                    host.tooltipService.move({
                        dataItems: d.tooltips,
                        identities: [d.selectionId],
                        coordinates: [x, y],
                        isTouchEvent: false
                    });
                })

            };
        }

        public hideAll(){
            d3.selectAll(".timeline").selectAll("*").attr("visibility", "hidden");
        }

        public showAll(){
            d3.selectAll(".timeline").selectAll("*").attr("visibility", "visible");
        }

        private static parseSettings(dataView: DataView): VisualSettings {
            return VisualSettings.parse(dataView) as VisualSettings;
        }

        /** 
         * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the 
         * objects and properties you want to expose to the users in the property pane.
         * 
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
            return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
        }

    }
}